import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { getDeckById } from "@/lib/db/decks";
import { getDeckCatalog } from "@/lib/db/deck-cards";
import { getGameById } from "@/lib/db/games";
import { buildBusinessCard, businessCardFilename, parseBusinessCardStyle } from "@/lib/decks/business-card";
import { loadImage, renderBusinessCard } from "@/lib/decks/business-card-image";
import { zonesForDeck } from "@/lib/decks/extra-legends";
import { readDeckAccess } from "@/lib/decks/read-access";
import { getDeckZones } from "@/lib/decks/zones";
import { deckIdSchema } from "@/lib/schemas/deck.schema";

/**
 * La carte de visite d'un deck : sa liste en PNG, au format d'une carte à jouer.
 *
 * `?style=illustrated|sober`, `qr=0` retire le QR code, `name=0` le nom du deck
 * et son auteur, `download=1` propose le fichier à l'enregistrement.
 *
 * Qui peut ouvrir le deck peut en tirer la carte. Un deck privé n'a jamais de
 * QR code : son lien ne s'ouvrirait que pour son auteur.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  if (!deckIdSchema.safeParse(deckId).success) {
    return NextResponse.json({ error: "ID de deck invalide" }, { status: 400 });
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const deck = await getDeckById(deckId);
  if (!deck || !(await readDeckAccess(deck, session?.user?.id))) {
    return NextResponse.json({ error: "Deck non trouvé" }, { status: 404 });
  }

  const search = request.nextUrl.searchParams;
  const style = parseBusinessCardStyle(search.get("style"));
  const base = (process.env.NEXT_PUBLIC_BASE_URL?.trim() || process.env.BETTER_AUTH_URL?.trim() || request.nextUrl.origin).replace(/\/$/, "");

  const [game, cardsById] = await Promise.all([getGameById(deck.gameId), getDeckCatalog(deck)]);
  const zones = zonesForDeck(getDeckZones(game), deck.cards);

  const layout = buildBusinessCard({
    deck,
    gameName: game?.name,
    gameSlug: game?.slug,
    zones,
    cardsById,
    style,
    showName: search.get("name") !== "0",
    qrUrl: deck.visibility !== "private" && search.get("qr") !== "0" ? `${base}/decks/${deck.id}` : undefined,
  });

  const illustrated = style === "illustrated";
  const [art, champion, logo] = await Promise.all([
    illustrated ? loadImage(layout.art?.image) : undefined,
    illustrated ? loadImage(layout.champion?.image) : undefined,
    loadImage(`${request.nextUrl.origin}/logo/android-chrome-192x192.png`),
  ]);

  const image = await renderBusinessCard(layout, { art, champion, logo });
  const body = await image.arrayBuffer();
  const filename = businessCardFilename(deck.name);

  return new NextResponse(body, {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `${search.get("download") === "1" ? "attachment" : "inline"}; filename="${filename}"`,
      // Le deck change : la carte se refait à chaque demande, et un deck privé
      // ne doit rester dans aucun cache partagé.
      "Cache-Control": "private, no-store",
    },
  });
}
