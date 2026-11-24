import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button.tsx";
import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import { BackLink } from "@/components/navigation/BackLink.tsx";
import type { CompanionGame } from "@/lib/companion/state";

/**
 * L'habillage d'une page de compagnon : retour, titre, barre d'outils du jeu.
 * La table elle-même passe en plein écran dès que la partie commence.
 */
export async function CompanionPage({ game, gameName, children }: { game: CompanionGame; gameName: string; children: ReactNode }) {
  const t = await getTranslations("Games.Companion");
  return (
    <div className="container mx-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-row flex-wrap items-center gap-4">
          <Button asChild>
            <BackLink href={`/games/${game}`} label={<span className="hidden lg:inline">{t("back")}</span>}>
              ←{" "}
            </BackLink>
          </Button>
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{gameName}</p>
          </div>
        </div>
        <GameToolsNavBar gameSlug={game} currentTab="companion" />
      </div>
      <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{t("description")}</p>
      {children}
    </div>
  );
}

export async function companionMetadata(game: CompanionGame, gameName: string) {
  const t = await getTranslations("Games.Companion");
  return {
    title: `Joutes - ${t("title")} ${gameName}`,
    description: t("description"),
    openGraph: {
      url: `https://joutes.app/games/${game}/companion`,
      siteName: "Joutes",
      title: `Joutes - ${t("title")} ${gameName}`,
      description: t("description"),
    },
  };
}
