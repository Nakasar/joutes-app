import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { listTradeHistoryPartners, listUserTrades } from "@/lib/db/trades.ts";
import { hasPermission } from "@/lib/db/permissions.ts";
import { getMyPlans } from "@/lib/subscriptions/access.ts";
import { planGrantingPermission } from "@/lib/subscriptions/entitlements.ts";
import { TRADE_HISTORY_PAGE_SIZE } from "@/lib/trade/history.ts";
import TradeHubClient from "./TradeHubClient.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

  // Le palier auquel attribuer ces filtres, pour l'écrire sans se tromper : un
  // abonné Pro doit lire « Joutes Pro ». `null` pour un administrateur ou une
  // permission accordée à la main — il n'y a alors aucun abonnement à créditer.
  const unlockedByPlan = planGrantingPermission(await getMyPlans(), "trades:full_history");

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
        unlockedByPlan={unlockedByPlan}
        currentUserId={session.user.id}
      />
    </div>
  );
}
