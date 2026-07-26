import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { executeTrade } from "@/lib/db/trades";
import { tradeSchema } from "@/lib/schemas/trade.schema";

/**
 * Applique un échange : les cartes de « mon offre » quittent la collection de
 * l'utilisateur, celles de l'autre partie y entrent.
 */
export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bodyRaw = await request.json().catch(() => null);
  const validate = tradeSchema.safeParse(bodyRaw);

  if (!validate.success) {
    return NextResponse.json({ error: "Invalid trade data", details: validate.error }, { status: 400 });
  }

  try {
    const result = await executeTrade({
      userId: session.user.id,
      offered: validate.data.offered,
      received: validate.data.received,
    });

    if (!result.ok) {
      // Le stock a pu changer depuis la recherche (autre onglet, autre appareil).
      const status = result.error === "insufficient-copies" ? 409 : 400;
      return NextResponse.json({ error: result.error, details: result.details }, { status });
    }

    return NextResponse.json({ removed: result.removed, added: result.added });
  } catch (error) {
    console.error("Error executing trade:", error);
    return NextResponse.json({ error: "Failed to execute trade" }, { status: 500 });
  }
}
