import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { GameToolsNavBar } from "@/components/games/GameToolsNavBar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { readGameBySlugOrId } from "@/lib/db/games-cached.ts";

/**
 * L'habillage commun des pages de jeu : titre, retour, barre d'outils. La
 * fonctionnalité « Jouer » se coche dans l'administration du jeu ; sans elle,
 * ces pages n'existent pas.
 */
export type PlayPageProps = { params: Promise<{ locale: string }> };

type PlayShellProps = PlayPageProps & { back: "game" | "lobby"; children: ReactNode };

export async function PlayShell({ params, back, children }: PlayShellProps) {
  // Sans cet appel, next-intl lit la langue à la requête et toute la route
  // devient dynamique ; la langue, elle, est énumérée statiquement.
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations("Games.Play");
  const game = await readGameBySlugOrId("riftbound");
  if (!game?.features?.play) notFound();

  return (
    <div className="mx-auto w-full max-w-[112rem] p-4 sm:p-6">
      <div className="mb-4 flex flex-row flex-wrap items-center justify-between gap-3">
        <div className="flex flex-row flex-wrap items-center gap-4">
          <Button asChild>
            <Link href={back === "game" ? "/games/riftbound" : "/games/riftbound/play"}>
              ← <span className="hidden lg:inline">{back === "game" ? t("back") : t("backToLobby")}</span>
            </Link>
          </Button>
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        </div>
        <GameToolsNavBar gameSlug="riftbound" currentTab="play" />
      </div>
      {children}
    </div>
  );
}
