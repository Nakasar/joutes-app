import {NextRequest, NextResponse} from "next/server";
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {Game} from "@/lib/types/Game";
import {getErratasByCardId} from "@/lib/db/erratas";

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

  const erratas = await getErratasByCardId(card.id.toString());

  return NextResponse.json({
    ...card,
    game: {
      id: game._id.toString(),
      name: game.name,
      slug: game.slug,
    },
    erratas,
  });
}