import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { joinTradeByCode } from "@/lib/db/trades";
import { tradeJoinSchema } from "@/lib/schemas/trade.schema";
import { tradeErrorResponse } from "@/lib/api/trade-errors";
import { notifyTradeCounterpart } from "@/lib/services/trade-notifications";

/**
 * Rejoint un échange à partir de son code d'invitation (QR code ou saisie
 * manuelle). Idempotent : un participant qui rejoint à nouveau récupère
 * simplement l'échange.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const validate = tradeJoinSchema.safeParse(bodyRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid join data", details: validate.error }, { status: 400 });
  }

  const code = validate.data.code.trim().toUpperCase();

  try {
    const result = await joinTradeByCode({ code, userId: session.user.id });
    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    // L'hôte n'est prévenu que d'une arrivée réelle : rouvrir le lien en étant
    // déjà participant ne renotifie personne.
    if (result.joined) {
      await notifyTradeCounterpart(result.trade, session.user.id, "joined");
    }
    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error joining trade:", error);
    return NextResponse.json({ error: "Failed to join trade" }, { status: 500 });
  }
}
