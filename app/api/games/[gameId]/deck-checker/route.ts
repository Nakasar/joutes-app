import {getGameBySlugOrId} from "@/lib/db/games";
import {NextResponse} from "next/server";
import {parseDeckList, serializeDeckList} from "@/app/games/riftbound/deck-checker/utils";
import {
  DeckList,
  getDeckFromPiltover,
  getDeckFromPiltoverCode,
  validateDeckList
} from "@/app/games/riftbound/deck-checker/action";

export async function POST(request: Request, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const game = await getGameBySlugOrId(gameId);

  if (!game || game?.slug !== "riftbound") {
    return NextResponse.json({
      error: {
        message: 'No deck checker available for this game',
      },
    }, { status: 404 });
  }

  const body = await request.json();
  const { deckList } = body;

  if (!deckList || typeof deckList !== "string") {
    return NextResponse.json({
      error: {
        message: 'Invalid deckList in body.',
      },
    }, { status: 400 });
  }

  try {
    let parsed: DeckList;
    if (deckList.startsWith('https://piltoverarchive.com/decks/view/')) {
      const deckId = deckList.split('/').at(-1)!;
      parsed = await getDeckFromPiltover(deckId);
    } else if (!deckList.includes(' ')) {
      parsed = await getDeckFromPiltoverCode(deckList)
    } else {
      parsed = parseDeckList(deckList);
    }

    const validated = await validateDeckList(parsed);
    const code = serializeDeckList(validated);

    return NextResponse.json({
      deck: validated,
      link: `https://joutes.app/games/riftbound/deck-checker?input=${code}`,
      code,
    });
  } catch (error) {
    console.warn(error);
    return NextResponse.json({
      error: {
        message: 'Failed to verify decklist.',
      }
    }, { status: 500 })
  }
}