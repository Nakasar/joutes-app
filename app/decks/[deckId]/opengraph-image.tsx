import { buildDeckOgImage, buildOgImage } from "@/lib/og";
import { getDeckById, getDeckCardPreviews } from "@/lib/db/decks";
import { getGameById } from "@/lib/db/games";

export const dynamic = "force-dynamic";

export const alt = "Deck - Joutes";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const deck = await getDeckById(deckId);

  // Un deck introuvable ou privé ne doit pas divulguer son contenu à un
  // crawler de réseau social non authentifié : on retombe sur le mockup générique.
  if (!deck || deck.visibility === "private") {
    return buildOgImage({
      title: "Deck",
      subtitle: "Construisez et partagez vos decks de jeux de cartes à collectionner sur Joutes.",
      variant: "decks",
    });
  }

  const [game, items] = await Promise.all([
    getGameById(deck.gameId),
    getDeckCardPreviews(deck),
  ]);

  return buildDeckOgImage({
    deckName: deck.name,
    gameName: game?.name,
    ownerLabel: deck.creatorName,
    items,
  });
}
