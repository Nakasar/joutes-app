import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { addCardToBooster, removeCardFromBooster, setBoosterCardFoil, userOwnsBooster } from "@/lib/db/boosters";

export async function POST(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userOwnsBooster(session.user.id, boosterId))) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || typeof body.setCode !== "string") {
    return NextResponse.json({ error: "Invalid card data" }, { status: 400 });
  }

  try {
    await addCardToBooster(boosterId, {
      cardId: typeof body.cardId === "string" ? body.cardId : undefined,
      name: body.name,
      setCode: body.setCode,
      collectorNumber: String(body.collectorNumber ?? ""),
      image: typeof body.image === "string" ? body.image : "",
      lang: typeof body.lang === "string" ? body.lang : undefined,
      subtitle: typeof body.subtitle === "string" ? body.subtitle : undefined,
      ...(body.foil === true ? { foil: true } : {}),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error adding card to booster:", error);
    return NextResponse.json({ error: "Failed to add card" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userOwnsBooster(session.user.id, boosterId))) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.entryId !== "string" || typeof body.foil !== "boolean") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    await setBoosterCardFoil(boosterId, body.entryId, body.foil);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating booster card:", error);
    return NextResponse.json({ error: "Failed to update card" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await userOwnsBooster(session.user.id, boosterId))) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  const entryId = request.nextUrl.searchParams.get("entryId");
  if (!entryId) {
    return NextResponse.json({ error: "Missing entryId" }, { status: 400 });
  }

  try {
    await removeCardFromBooster(boosterId, entryId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error removing card from booster:", error);
    return NextResponse.json({ error: "Failed to remove card" }, { status: 500 });
  }
}
