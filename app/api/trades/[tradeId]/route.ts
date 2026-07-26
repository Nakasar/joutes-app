import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { cancelTrade, getTrade } from "@/lib/db/trades";
import { tradeErrorResponse } from "@/lib/api/trade-errors";
import { notifyTradeCounterpart } from "@/lib/services/trade-notifications";

/** État courant d'un échange (les deux offres, les validations, la révision). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const trade = await getTrade(tradeId, session.user.id);
    if (!trade) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    return NextResponse.json({ trade });
  } catch (error) {
    console.error("Error loading trade:", error);
    return NextResponse.json({ error: "Failed to load trade" }, { status: 500 });
  }
}

/** Annule un échange en cours. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await cancelTrade({ tradeId, userId: session.user.id });
    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    await notifyTradeCounterpart(result.trade, session.user.id, "cancelled");
    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error cancelling trade:", error);
    return NextResponse.json({ error: "Failed to cancel trade" }, { status: 500 });
  }
}
