import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revokeTradeValidation, validateTradeSide } from "@/lib/db/trades";
import { tradeValidateSchema } from "@/lib/schemas/trade.schema";
import { tradeErrorResponse } from "@/lib/api/trade-errors";
import { notifyTradeCounterpart } from "@/lib/services/trade-notifications";

/**
 * Valide sa face de l'échange. Quand toutes les faces occupées par un compte
 * sont validées, l'échange est appliqué aux collections dans la même requête.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const validate = tradeValidateSchema.safeParse(bodyRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid validation data", details: validate.error }, { status: 400 });
  }

  try {
    const result = await validateTradeSide({
      tradeId,
      userId: session.user.id,
      revision: validate.data.revision,
    });

    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    await notifyTradeCounterpart(
      result.trade,
      session.user.id,
      result.applied ? "completed" : "validated"
    );

    return NextResponse.json({ trade: result.trade, applied: !!result.applied });
  } catch (error) {
    console.error("Error validating trade:", error);
    return NextResponse.json({ error: "Failed to validate trade" }, { status: 500 });
  }
}

/** Retire sa validation, pour pouvoir retoucher son offre. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await revokeTradeValidation({ tradeId, userId: session.user.id });
    if (!result.ok) {
      return tradeErrorResponse(result);
    }
    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error revoking trade validation:", error);
    return NextResponse.json({ error: "Failed to revoke validation" }, { status: 500 });
  }
}
