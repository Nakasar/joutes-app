import { auth } from "@/lib/auth";
import { getPlayGroupByIdAndUser } from "@/lib/db/play-groups";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { BoosterCardDb } from "@/lib/types/booster";
import { collectionCardBorrowSchema } from "@/lib/schemas/collection.schema";
import { getForSaleInfoForEntries, removeSellListItemByCollectionEntryId } from "@/lib/db/sell-lists";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playGroupId: string; cardId: string }> }
) {
  const { playGroupId, cardId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  try {
    const cards = await db.collection<BoosterCardDb & { _id: ObjectId }>('collection-cards').find({
      playGroupId: new ObjectId(group.id),
      cardId: cardId,
    }).toArray();

    const forSaleByEntry = await getForSaleInfoForEntries(cards.map((c) => c._id));

    return NextResponse.json({
      quantity: cards.length,
      cards: cards.map((c) => ({
        id: c._id.toString(),
        foil: c.foil,
        language: c.language,
        condition: c.condition,
        grade: c.grade,
        obtainedAt: c.obtainedAt,
        acquisitionPrice: c.acquisitionPrice,
        acquisitionCurrency: c.acquisitionCurrency,
        borrowedBy: c.borrowedBy,
        forSale: forSaleByEntry.get(c._id.toString()),
      })),
    });
  } catch (error) {
    console.error("Error fetching play-group cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}

/**
 * Mark (or unmark) a specific copy in the play-group's shared collection as borrowed.
 * Any member of the group may update this.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ playGroupId: string; cardId: string }> }
) {
  const { playGroupId, cardId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const bodyRaw = await request.json();
  const validate = collectionCardBorrowSchema.safeParse(bodyRaw);
  if (!validate.success) {
    return NextResponse.json({ error: "Données invalides", details: validate.error }, { status: 400 });
  }
  const { entryId, borrowedBy } = validate.data;

  try {
    const result = await db.collection<BoosterCardDb>("collection-cards").findOneAndUpdate(
      {
        _id: new ObjectId(entryId),
        playGroupId: new ObjectId(group.id),
        cardId,
      },
      borrowedBy ? { $set: { borrowedBy } } : { $unset: { borrowedBy: "" } },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json({ error: "Card not found in collection" }, { status: 404 });
    }

    return NextResponse.json({ id: entryId, borrowedBy: result.borrowedBy });
  } catch (error) {
    console.error("Error updating borrow status:", error);
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ playGroupId: string; cardId: string }> }
) {
  const { playGroupId, cardId } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const group = await getPlayGroupByIdAndUser(playGroupId, session.user.id);
  if (!group) {
    return NextResponse.json({ error: "Groupe introuvable" }, { status: 404 });
  }

  const entryId = request.nextUrl.searchParams.get("entryId");

  try {
    const filter: Record<string, unknown> = {
      playGroupId: new ObjectId(group.id),
      cardId: cardId,
    };

    if (entryId) {
      filter._id = new ObjectId(entryId);
    }

    const result = await db.collection<BoosterCardDb>('collection-cards').findOneAndDelete(filter);

    if (!result) {
      return NextResponse.json({ error: "Card not found in collection" }, { status: 404 });
    }

    await removeSellListItemByCollectionEntryId(result._id.toString());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting card from play-group collection:", error);
    return NextResponse.json(
      { error: "Failed to delete card" },
      { status: 500 }
    );
  }
}
