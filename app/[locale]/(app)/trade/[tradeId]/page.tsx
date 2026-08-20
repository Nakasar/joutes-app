import { Suspense } from "react";
import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { getTrade, listTradeGames } from "@/lib/db/trades.ts";
import TradeEditor from "./TradeEditor.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Trade");
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
    robots: { index: false, follow: false },
  };
}

async function TradePageContent({ params }: { params: Promise<{ tradeId: string }> }) {
  const { tradeId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect(`/login?redirect=${encodeURIComponent(`/trade/${tradeId}`)}`);
  }

  // `getTrade` ne renvoie l'échange qu'à ses participants : un non-participant
  // obtient donc un 404, sans distinguer « inexistant » de « pas à moi ».
  const [trade, games] = await Promise.all([getTrade(tradeId, session.user.id), listTradeGames()]);

  if (!trade) {
    notFound();
  }

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <TradeEditor initialTrade={trade} currentUserId={session.user.id} games={games} />
    </div>
  );
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function TradePage(props: Parameters<typeof TradePageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto p-4 sm:p-6">
          <AccountPanelSkeleton cards={2} label="Chargement de l’échange" />
        </div>
      }
    >
      <TradePageContent {...props} />
    </Suspense>
  );
}
