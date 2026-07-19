import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar";
import db from "@/lib/mongodb";
import { Game } from "@/lib/types/Game";
import { notFound } from "next/navigation";
import TrackerClient from "./TrackerClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Games.Tracker");

  return {
    title: `Joutes - ${t("title")}`,
    description: t("description"),
    keywords: ["riftbound", "suivi de partie", "compteur de points", "tracker"],
    openGraph: {
      url: `https://joutes.app/games/riftbound/tracker`,
      siteName: "Joutes",
      title: `Joutes - ${t("title")}`,
      description: t("description"),
    },
  };
}

export default async function RiftboundTrackerPage() {
  const t = await getTranslations("Games.Tracker");

  const game = await db.collection<Game>("games").findOne({ slug: "riftbound" });
  if (!game || !game.slug) notFound();

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-row flex-wrap justify-between">
        <div className="flex flex-row flex-wrap gap-4">
          <Button asChild>
            <Link href="/games/riftbound" className="text-blue-600 hover:underline">
              ← <span className="hidden lg:inline">{t("back")}</span>
            </Link>
          </Button>
          <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
        </div>
        <GameToolsNavBar gameSlug="riftbound" currentTab="tracker" />
      </div>
      <p className="mb-6 text-muted-foreground">{t("description")}</p>

      <TrackerClient />
    </div>
  );
}
