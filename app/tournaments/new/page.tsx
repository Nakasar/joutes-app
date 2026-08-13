import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getAllGames } from "@/lib/db/games";
import { resolveGameTournamentDefaults } from "@/lib/tournaments/game-defaults";
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

  // Les réglages sont résolus ici, et non dans le tunnel : ils vivent à côté
  // des types de tournoi, dont le module tire des dépendances serveur. Un jeu
  // sans preset ni réglage d'administration n'en porte aucun, et ses phases
  // gardent les défauts de l'API.
  const games: WizardGame[] = (await getAllGames())
    .map((game) => {
      const defaults = resolveGameTournamentDefaults(game.slug, game.tournamentDefaults);
      const configured = game.tournamentDefaults !== undefined;
      return {
        id: game.id,
        name: game.name,
        type: game.type,
        icon: game.images?.icon ?? game.icon,
        ...((defaults.preset || configured) && {
          phaseDefaults: {
            // Le best-of reste hors de cette liste : le tunnel le demande, et
            // ces réglages sont appliqués par-dessus la réponse donnée.
            ...(defaults.statsPresetKey && { statsPresetKey: defaults.statsPresetKey }),
            fixedScoring: defaults.fixedScoring,
            swissPairing: defaults.swissPairing,
            resultMode: defaults.resultMode,
            requireMatchStats: defaults.requireMatchStats,
            // La chaîne n'est portée par la phase que si l'administration l'a
            // réglée : sinon la phase suit son preset, et le suivra encore si
            // les règles officielles du jeu évoluent.
            ...(game.tournamentDefaults?.tiebreakers && { tiebreakers: defaults.tiebreakers }),
          },
        }),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return <CreateTournamentWizard games={games} />;
}
