import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { BoosterCardDb } from "@/lib/types/booster";

export async function GET(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cards = await db.collection<BoosterCardDb & { _id: ObjectId }>('collection-cards').find({
      userId: new ObjectId(session.user.id),
      cardId: cardId,
    }).toArray();

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
      })),
    });
  } catch (error) {
    console.error("Error fetching user cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entryId = request.nextUrl.searchParams.get("entryId");

  try {
    const filter: Record<string, unknown> = {
      userId: new ObjectId(session.user.id),
      cardId: cardId,
    };

    if (entryId) {
      filter._id = new ObjectId(entryId);
    }

    const result = await db.collection<BoosterCardDb>('collection-cards').findOneAndDelete(filter);

    if (!result) {
      return NextResponse.json({ error: "Card not found in collection" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting card from collection:", error);
    return NextResponse.json(
      { error: "Failed to delete card" },
      { status: 500 }
    );
  }
}

