import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteBooster, getBooster, updateBooster, userOwnsBooster } from "@/lib/db/boosters";
import { isBoosterType, normalizeBoosterType } from "@/lib/constants/booster-types";

export async function GET(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booster = await getBooster(boosterId);
  if (!booster || booster.userId !== session.user.id) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  return NextResponse.json({ booster });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booster = await getBooster(boosterId);
  if (!booster || booster.userId !== session.user.id) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.type !== "string") {
    return NextResponse.json({ error: "Missing type" }, { status: 400 });
  }

  const type = normalizeBoosterType(body.type);
  if (!isBoosterType(booster.game?.slug, type)) {
    return NextResponse.json({ error: "Invalid booster type" }, { status: 400 });
  }

  await updateBooster(boosterId, { type });
  return NextResponse.json({ success: true, type });
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

  await deleteBooster(boosterId);
  return NextResponse.json({ success: true });
}
