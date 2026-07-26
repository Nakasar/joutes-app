import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getTrade, removeTradePartner, setTradePartner } from "@/lib/db/trades";
import { getUserByEmail, getUserByTagOrId } from "@/lib/db/users";
import { tradePartnerSchema } from "@/lib/schemas/trade.schema";
import { tradeErrorResponse } from "@/lib/api/trade-errors";
import { notifyTradeCounterpart } from "@/lib/services/trade-notifications";

/**
 * Installe le partenaire de l'échange, désigné par son tag `pseudo#1234`, son
 * nom d'utilisateur ou son adresse e-mail.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const validate = tradePartnerSchema.safeParse(bodyRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid partner data", details: validate.error }, { status: 400 });
  }

  const { identifier } = validate.data;

  try {
    const partner = identifier.includes("@")
      ? await getUserByEmail(identifier)
      : await getUserByTagOrId(identifier);

    if (!partner) {
      return NextResponse.json({ error: "user-not-found" }, { status: 404 });
    }

    const result = await setTradePartner({ tradeId, userId: session.user.id, partnerUserId: partner.id });
    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    await notifyTradeCounterpart(result.trade, session.user.id, "invited", { recipientUserId: partner.id });
    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error setting trade partner:", error);
    return NextResponse.json({ error: "Failed to set partner" }, { status: 500 });
  }
}

/** Libère la face du partenaire : le créateur le retire, ou le partenaire quitte l'échange. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Le destinataire de la notification est lu avant le retrait : après, la
    // face libérée ne porte plus aucun compte.
    const before = await getTrade(tradeId, session.user.id);
    const counterpartId = before?.sides.find((side) => side.user && side.user.id !== session.user.id)?.user?.id;
    const wasCreator = before?.createdBy === session.user.id;

    const result = await removeTradePartner({ tradeId, userId: session.user.id });
    if (!result.ok) {
      return tradeErrorResponse(result);
    }

    await notifyTradeCounterpart(result.trade, session.user.id, wasCreator ? "removed" : "left", {
      recipientUserId: counterpartId,
    });
    return NextResponse.json({ trade: result.trade });
  } catch (error) {
    console.error("Error removing trade partner:", error);
    return NextResponse.json({ error: "Failed to remove partner" }, { status: 500 });
  }
}
