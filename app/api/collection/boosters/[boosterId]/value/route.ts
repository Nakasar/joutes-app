import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { computeBoosterValue, getBooster } from "@/lib/db/boosters";

/**
 * Recalcule la valeur du booster à partir du prix de ses cartes et l'écrit sur
 * le booster. Une action explicite du propriétaire : les prix ne sont relevés
 * que de temps en temps (cf. docs/CARD_PRICES.md), et une valeur datée du
 * dernier clic se comprend mieux qu'un total qui bouge tout seul.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ boosterId: string }> }) {
  const { boosterId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const booster = await getBooster(boosterId);
  if (!booster || booster.userId !== session.user.id) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  const value = await computeBoosterValue(boosterId);
  if (!value) {
    return NextResponse.json({ error: "Booster not found" }, { status: 404 });
  }

  return NextResponse.json({ value });
}
