import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createTrade, listUserTrades } from "@/lib/db/trades";
import { hasPermission } from "@/lib/db/permissions";

/**
 * Échanges de l'utilisateur : en cours et historique.
 *
 * L'historique s'arrête aux sept derniers jours sans la permission
 * `trades:full_history` — la même règle que `/api/trades/history`, qui la porte
 * avec les filtres. `hiddenCount` dit combien d'échanges plus anciens attendent
 * derrière l'abonnement.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const fullHistory = await hasPermission("trades:full_history");
    const trades = await listUserTrades(session.user.id, { fullHistory });
    return NextResponse.json(trades);
  } catch (error) {
    console.error("Error listing trades:", error);
    return NextResponse.json({ error: "Failed to list trades" }, { status: 500 });
  }
}

/** Ouvre un nouvel échange, contrepartie libre. */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const trade = await createTrade(session.user.id);
    return NextResponse.json({ trade }, { status: 201 });
  } catch (error) {
    console.error("Error creating trade:", error);
    return NextResponse.json({ error: "Failed to create trade" }, { status: 500 });
  }
}
