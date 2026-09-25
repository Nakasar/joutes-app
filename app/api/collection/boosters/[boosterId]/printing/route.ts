import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { setBoosterCardsPrinting, userOwnsBooster } from "@/lib/db/boosters";

/**
 * Passe toutes les cartes du booster dans une variante d'impression.
 * `printingId` à `null` (ou vide) ramène les cartes à leur version de base.
 */
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
  if (!body || (body.printingId !== null && typeof body.printingId !== "string")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const result = await setBoosterCardsPrinting(boosterId, body.printingId || undefined);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Error updating booster printings:", error);
    return NextResponse.json({ error: "Failed to update printings" }, { status: 500 });
  }
}
