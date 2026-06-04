import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { BoosterCardDb } from "@/lib/types/booster";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await db.collection<BoosterCardDb>('booster-cards').findOneAndDelete({
      userId: new ObjectId(session.user.id),
      cardId: cardId,
    });

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ cardId: string }> }) {
  const { cardId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const countResult = await db.collection<BoosterCardDb>('booster-cards').countDocuments({
        userId: new ObjectId(session.user.id),
        cardId: cardId,
    });

    return NextResponse.json({
        quantity: countResult,
    });
  } catch (error) {
    console.error("Error fetching user cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}
