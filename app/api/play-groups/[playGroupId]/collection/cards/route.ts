import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { collectionCardSchema } from "@/lib/schemas/collection.schema";

/**
 * Add an individual card to a play-group's shared collection. Any member of
 * the group may add cards; the adding member is recorded for audit purposes.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ playGroupId: string }> }) {
  const { playGroupId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const cardRaw = await request.json();
  const validate = collectionCardSchema.safeParse(cardRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid card data", details: validate.error }, { status: 400 });
  }
  const card = validate.data;

  const insertResult = await db.collection('collection-cards').insertOne({
    cardId: card.cardId,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    name: card.name,
    image: card.image,
    playGroupId: new ObjectId(group.id),
    addedByUserId: new ObjectId(session.user.id),
    ...(card.foil !== undefined && { foil: card.foil }),
    ...(card.language !== undefined && { language: card.language }),
    ...(card.condition !== undefined && { condition: card.condition }),
    ...(card.grade !== undefined && { grade: card.grade }),
    ...(card.obtainedAt !== undefined && { obtainedAt: card.obtainedAt }),
    ...(card.acquisitionPrice !== undefined && { acquisitionPrice: card.acquisitionPrice }),
    ...(card.acquisitionCurrency !== undefined && { acquisitionCurrency: card.acquisitionCurrency }),
  });

  return NextResponse.json({ id: insertResult.insertedId.toString() });
}
