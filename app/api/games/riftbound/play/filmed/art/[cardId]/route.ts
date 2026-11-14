import { NextResponse } from "next/server";

import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { readGameBySlugOrId } from "@/lib/db/games-cached";
import { artSource, isCardId } from "@/lib/filmed/art";

/** Au-delà, ce n'est pas une illustration de carte. */
const MAX_BYTES = 4_000_000;

/**
 * L'illustration d'une carte du catalogue, servie par Joutes : la table filmée
 * en lit les pixels dans le navigateur. Seules les cartes du catalogue passent,
 * et seulement depuis les hébergeurs connus : ce n'est pas un relais ouvert.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;
  const game = await readGameBySlugOrId("riftbound");
  if (!game?.features?.play || !isCardId(cardId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [card] = await getDeckCardInfos(game.id, [cardId]);
  const source = artSource(card?.image);
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upstream = await fetch(source, { signal: AbortSignal.timeout(10_000) }).catch(() => null);
  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !type.startsWith("image/")) {
    return NextResponse.json({ error: "Bad gateway" }, { status: 502 });
  }
  const bytes = await upstream.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) return NextResponse.json({ error: "Bad gateway" }, { status: 502 });

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
