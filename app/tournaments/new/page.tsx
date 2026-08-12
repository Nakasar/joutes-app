import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getAllGames } from "@/lib/db/games";
import { defaultPresetForGameSlug } from "@/lib/tournaments/game-presets";
import { CreateTournamentWizard, type WizardGame } from "./CreateTournamentWizard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tournaments");
  return {
    title: t("new.title"),
  };
}

export default async function NewTournamentPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const locale = await getLocale();

  // Les presets sont résolus ici, et non dans le tunnel : ils vivent à côté des
  // types de tournoi, dont le module tire des dépendances serveur.
  const games: WizardGame[] = (await getAllGames())
    .map((game) => {
      const preset = defaultPresetForGameSlug(game.slug);
      return {
        id: game.id,
        name: game.name,
        type: game.type,
        icon: game.images?.icon ?? game.icon,
        ...(preset && {
          phaseDefaults: {
            statsPresetKey: preset.key,
            fixedScoring: preset.defaults.fixedScoring,
            swissPairing: preset.defaults.swissPairing,
            resultMode: preset.defaults.resultMode,
            requireMatchStats: preset.defaults.requireStats,
          },
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return <CreateTournamentWizard games={games} />;
}
