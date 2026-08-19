import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import { notFound } from "next/navigation";
import TrackerClient from "./TrackerClient.tsx";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";


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

/**
 * Le suivi de partie ne dépend ni de la session ni de l'URL : la lecture du jeu
 * étant en cache, la page prérend entièrement. Le `await connection()` qui était
 * ici débloquait le pilote Mongo au prix du rendu à la requête.
 */
export default async function RiftboundTrackerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // Sans cet appel, les fonctions serveur de next-intl lisent la langue à la
  // requête, ce qui suffit à rendre toute la route dynamique. La langue, elle,
  // est statiquement énumérée.
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Games.Tracker");

  const game = await readGameBySlugOrId("riftbound");
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
