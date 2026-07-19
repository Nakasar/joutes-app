import {NextRequest, NextResponse} from "next/server";
import {headers} from "next/headers";
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {Game} from "@/lib/types/Game";
import {getErratasByCardId} from "@/lib/db/erratas";
import {getCardsByNames} from "@/lib/db/cards";
import {extractBracketedMentions} from "@/lib/errata-markdown";
import {auth} from "@/lib/auth";

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string; cardId: string }> }) {
  const { gameId, cardId } = await params;

  const game = await db.collection<Game>('games').findOne({ slug: gameId });

  if (!game) {
    return NextResponse.json({ error: "game does not exist" }, { status: 404 });
  }

  const card = await db.collection<BoosterCard>('cards').findOne({
    gameId: game._id,
    id: cardId,
  });

  if (!card) {
    return NextResponse.json({ error: "card not found" }, { status: 404 });
  }

  const session = await auth.api.getSession({ headers: await headers() });

  const erratas = await getErratasByCardId(card.id.toString(), session?.user?.id);

  const mentionedCardNames = [
    ...new Set(
      erratas.flatMap((errata) => [
        ...extractBracketedMentions(errata.details),
        ...(errata.translations ?? []).flatMap((tr) => extractBracketedMentions(tr.details)),
      ])
    ),
  ];
  const mentionedCards = await getCardsByNames(game._id, mentionedCardNames);
  const cardIdByName = Object.fromEntries(mentionedCards.map((c) => [c.name.toLowerCase(), c.id]));
  const cardsById = Object.fromEntries(mentionedCards.map((c) => [c.id, c]));

  return NextResponse.json({
    ...card,
    game: {
      id: game._id.toString(),
      name: game.name,
      slug: game.slug,
    },
    erratas,
    cardIdByName,
    cardsById,
  });
}
