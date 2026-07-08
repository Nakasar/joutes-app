import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { deleteBooster, getBooster, userOwnsBooster } from "@/lib/db/boosters";

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
