import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { listTradeHistoryPartners, listUserTrades } from "@/lib/db/trades";
import { hasPermission } from "@/lib/db/permissions";
import { TRADE_HISTORY_PAGE_SIZE } from "@/lib/trade/history";
import TradeHubClient from "./TradeHubClient";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trade");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    keywords: ["échange de cartes", "trade", "collection de cartes", "jeux de cartes à collectionner"],
    openGraph: {
      title: `${t("metadata.title")} - Joutes`,
      description: t("metadata.description"),
    },
  };
}

export default async function TradeHubPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  // L'historique complet et ses filtres arrivent avec Joutes Expert ou Joutes
  // Pro — et s'accordent aussi à la main, `trades:full_history` étant une
  // permission comme une autre.
  const canFilter = await hasPermission("trades:full_history");

  const [trades, partners] = await Promise.all([
    // La même taille de page que `/api/trades/history` : sans cela, l'écran
    // afficherait cinquante échanges au chargement puis vingt dès la première
    // interaction, en sautant.
    listUserTrades(session.user.id, {
      fullHistory: canFilter,
      historyLimit: TRADE_HISTORY_PAGE_SIZE,
    }),
    // Le menu du filtre par partenaire : rien à charger pour qui ne peut pas
    // filtrer.
    canFilter ? listTradeHistoryPartners(session.user.id) : Promise.resolve([]),
  ]);

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <TradeHubClient
        initialOpen={trades.open}
        initialPast={trades.past}
        initialTotal={trades.pastTotal}
        hiddenCount={trades.hiddenCount}
        partners={partners}
        canFilter={canFilter}
        currentUserId={session.user.id}
      />
    </div>
  );
}
