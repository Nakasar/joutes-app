import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { hasPermission } from "@/lib/db/permissions";
import { listTradeHistoryPartners, searchTradeHistory } from "@/lib/db/trades";
import {
  TRADE_HISTORY_WINDOW_DAYS,
  resolveHistoryQuery,
  type TradeHistoryFilters,
} from "@/lib/trade/history";

/**
 * Historique des échanges, filtré et paginé.
 *
 * Les filtres (carte, partenaire, plage de dates, tri) et l'historique complet
 * demandent la permission `trades:full_history`, qu'ouvrent Joutes Expert et
 * Joutes Pro. Sans elle, la réponse s'arrête aux sept derniers jours et les
 * filtres reçus sont **écartés plutôt que refusés** : l'appel réussit, et
 * `dropped` dit ce qui n'a pas été honoré. Un 403 obligerait chaque client à
 * connaître la règle avant d'appeler ; là, il la découvre dans la réponse.
 *
 * Les paramètres ne sont pas validés par un schéma : `resolveHistoryQuery` les
 * normalise et les borne, et c'est lui qui porte les tests. Deux couches de
 * garde-fous divergeraient.
 */
export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const filters: TradeHistoryFilters = {
    card: searchParams.get("card"),
    partner: searchParams.get("partner"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    sort: searchParams.get("sort"),
    page: Number.parseInt(searchParams.get("page") ?? "1", 10),
    limit: Number.parseInt(searchParams.get("limit") ?? "", 10),
  };

  try {
    const fullHistory = await hasPermission("trades:full_history");
    const query = resolveHistoryQuery(filters, { fullHistory });

    const [page, partners] = await Promise.all([
      searchTradeHistory(session.user.id, query),
      // Le menu du filtre par partenaire : inutile à qui ne peut pas filtrer,
      // et une lecture de moins pour lui.
      fullHistory ? listTradeHistoryPartners(session.user.id) : Promise.resolve([]),
    ]);

    return NextResponse.json({
      ...page,
      partners,
      fullHistory,
      windowDays: query.windowed ? TRADE_HISTORY_WINDOW_DAYS : null,
      dropped: query.dropped,
    });
  } catch (error) {
    console.error("Error searching trade history:", error);
    return NextResponse.json({ error: "Failed to search trade history" }, { status: 500 });
  }
}
