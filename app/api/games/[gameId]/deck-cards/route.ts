import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getGameBySlugOrId } from "@/lib/db/games";
import { getDeckCardInfos, resolveCardIdsByName } from "@/lib/db/deck-cards";
import { normalizeCardName } from "@/lib/decks/text";

type Params = Promise<{ gameId: string }>;

/**
 * Cartes d'un deck, résolues contre le catalogue d'un jeu.
 *
 * L'éditeur en a besoin de deux façons : par identifiant, pour réafficher un
 * deck dont il vient de changer le contenu, et par nom, pour appliquer une
 * liste collée dans l'onglet « Texte ». Les deux lisent le même catalogue et
 * rendent la même forme de carte, celle que les vignettes savent afficher.
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
  }

  const ids = request.nextUrl.searchParams.getAll("id").flatMap((value) => value.split(",")).filter(Boolean);

  // Une requête sans borne pourrait demander le catalogue entier carte par
  // carte : la limite est celle d'un très gros deck, pas d'un import.
  if (ids.length > 500) {
    return NextResponse.json({ error: "Trop de cartes demandées" }, { status: 400 });
  }

  const cards = await getDeckCardInfos(game.id, ids);
  return NextResponse.json({ cards });
}

const resolveSchema = z.object({
  names: z.array(z.string().min(1).max(200)).max(1000),
});

export async function POST(request: NextRequest, { params }: { params: Params }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);
  if (!game) {
    return NextResponse.json({ error: "Jeu non trouvé" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = resolveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const byName = await resolveCardIdsByName(game.id, parsed.data.names);

  // Le client apparie sur le nom normalisé : la réponse porte donc la clé, pas
  // la forme exacte que la carte a en base, qui peut différer par un accent.
  return NextResponse.json({
    matches: Object.fromEntries(
      parsed.data.names.flatMap((name) => {
        const card = byName.get(normalizeCardName(name));
        return card ? [[name, card] as const] : [];
      })
    ),
  });
}
