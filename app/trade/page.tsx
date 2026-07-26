import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Metadata } from "next/types";
import { listTradeGames } from "@/lib/db/trades";
import TradeClient from "./TradeClient";

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

export default async function TradePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const games = await listTradeGames();

  return (
    <div className="container mx-auto p-4 sm:p-6">
      <TradeClient games={games} />
    </div>
  );
}
