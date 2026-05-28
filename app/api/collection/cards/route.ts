import { auth } from "@/lib/auth";
import { getUserCards } from "@/lib/db/boosters";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { collectionCardSchema } from "@/lib/schemas/collection.schema";

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "0");
  const limit = parseInt(searchParams.get("limit") || "50");
  const gameSlug = searchParams.get("gameSlug") || undefined;
  const setCode = searchParams.get("setCode") || undefined;
  const cardType = searchParams.get("type") || undefined;

  try {
    const game = gameSlug ? await db.collection("games").findOne({ slug: gameSlug }) : null

    const result = await getUserCards({
      userId: session.user.id,
      page,
      limit,
      gameId: game?._id.toString(),
      setCode,
      cardType,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching user cards:", error);
    return NextResponse.json(
      { error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}

/**
 * Add an individual card to the user's collection.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cardRaw = await request.json();
  const validate = collectionCardSchema.safeParse(cardRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid card data", details: validate.error }, { status: 400 });
  }
  const card = validate.data;

  await db.collection('booster-cards').insertOne({
    cardId: card.cardId,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    name: card.name,
    image: card.image,
    userId: new ObjectId(session.user.id),
  });

  return NextResponse.json({});
}
