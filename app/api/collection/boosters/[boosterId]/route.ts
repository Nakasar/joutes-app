import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteBooster, getBooster, updateBooster, userOwnsBooster } from "@/lib/db/boosters";
import { isBoosterType, normalizeBoosterType } from "@/lib/constants/booster-types";
import { BOOSTER_NOTE_MAX_LENGTH } from "@/lib/constants/boosters";

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
  const hasType = body?.type !== undefined;
  const hasNote = body?.note !== undefined;
  if (!hasType && !hasNote) {
    return NextResponse.json({ error: "Missing type or note" }, { status: 400 });
  }

  let type: string | undefined;
  if (hasType) {
    if (typeof body.type !== "string") {
      return NextResponse.json({ error: "Invalid booster type" }, { status: 400 });
    }
    type = normalizeBoosterType(body.type);
    if (!isBoosterType(booster.game?.slug, type)) {
      return NextResponse.json({ error: "Invalid booster type" }, { status: 400 });
    }
  }

  // `note` accepte `null` ou une chaîne vide pour effacer la note existante.
  let note: string | null | undefined;
  if (hasNote) {
    if (body.note !== null && typeof body.note !== "string") {
      return NextResponse.json({ error: "Invalid note" }, { status: 400 });
    }
    const trimmed = typeof body.note === "string" ? body.note.trim() : "";
    if (trimmed.length > BOOSTER_NOTE_MAX_LENGTH) {
      return NextResponse.json({ error: "Note too long" }, { status: 400 });
    }
    note = trimmed || null;
  }

  await updateBooster(boosterId, { type, note });
  return NextResponse.json({ success: true, type, note });
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
