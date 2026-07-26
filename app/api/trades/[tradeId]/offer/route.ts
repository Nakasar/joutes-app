import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { setTradeSideCards } from "@/lib/db/trades";
import { tradeOfferUpdateSchema } from "@/lib/schemas/trade.schema";
import { tradeErrorResponse } from "@/lib/api/trade-errors";

/**
 * Remplace le contenu d'une offre : sa propre face (`target: "mine"`), ou la
 * contrepartie libre d'un échange sans partenaire (`target: "counterparty"`).
 * Le serveur relit les cartes depuis la collection ou le catalogue, et annule
 * les validations en cours.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const validate = tradeOfferUpdateSchema.safeParse(bodyRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid offer data", details: validate.error }, { status: 400 });
  }

  try {
    const result = await setTradeSideCards({
      tradeId,
      userId: session.user.id,
      target: validate.data.target,
      cards: validate.data.cards,
    });

    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error updating trade offer:", error);
    return NextResponse.json({ error: "Failed to update offer" }, { status: 500 });
  }
}
