import { NextRequest } from "next/server";
import { buildDeckCheckerOgImage, buildOgImage, CARD_GRID_MAX_ITEMS, type CardGridItem } from "@/lib/og";
import { getDeckFromPiltoverCode, validateDeckList, type DeckListCard } from "@/app/games/riftbound/deck-checker/action";

export const dynamic = "force-dynamic";

const FALLBACK_TITLE = "Vérification de deck";
const FALLBACK_SUBTITLE = "Vérifiez la légalité de votre deck Riftbound sur Joutes.";

export async function GET(request: NextRequest) {
  const input = request.nextUrl.searchParams.get("input");

  if (!input || input.length < 10) {
    return buildOgImage({ title: FALLBACK_TITLE, subtitle: FALLBACK_SUBTITLE, variant: "decks" });
  }

  try {
    const parsed = await getDeckFromPiltoverCode(input);
    const validated = await validateDeckList(parsed);

    const flatCards: DeckListCard[] = [
      ...validated.champions,
      ...validated.legends,
      ...validated.maindeck,
      ...validated.battlefields,
      ...validated.runes,
      ...validated.sideboard,
    ];

    const items: CardGridItem[] = flatCards
      .filter((card): card is DeckListCard & { image: string } => !!card.image)
      .slice(0, CARD_GRID_MAX_ITEMS)
      .map((card) => ({
        name: card.name,
        image: card.image,
        quantity: card.quantity,
        hasNote: (card.erratas?.length ?? 0) > 0,
      }));

    return buildDeckCheckerOgImage({
      championName: validated.champions[0]?.name,
      items,
    });
  } catch (error) {
    console.warn("Failed to render deck-checker preview image", error);
    return buildOgImage({ title: FALLBACK_TITLE, subtitle: FALLBACK_SUBTITLE, variant: "decks" });
  }
}
