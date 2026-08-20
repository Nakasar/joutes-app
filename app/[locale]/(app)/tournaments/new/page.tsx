import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getLeagueById, isLeagueOrganizer } from "@/lib/db/leagues.ts";
import { resolveGameTournamentDefaults } from "@/lib/tournaments/game-defaults.ts";
import { CreateTournamentWizard, type WizardGame } from "./CreateTournamentWizard.tsx";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Tournaments");
  return {
    title: t("new.title"),
  };
}

async function NewTournamentPageContent({
  searchParams,
}: {
  searchParams: Promise<{ leagueId?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const locale = await getLocale();

  // Création depuis la gestion d'une ligue. Le rattachement n'est proposé que
  // si l'utilisateur organise vraiment cette ligue : sinon on crée un tournoi
  // ordinaire plutôt que d'échouer à la dernière étape du tunnel.
  const { leagueId } = await searchParams;
  const league = leagueId ? await getLeagueById(leagueId).catch(() => null) : null;
  const linkedLeague =
    league &&
    league.format === "POINTS" &&
    (await isLeagueOrganizer(league.id, session.user.id))
      ? { id: league.id, name: league.name }
      : null;

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

  return <CreateTournamentWizard games={games} league={linkedLeague} />;
}

/**
 * Tout cet écran est derrière la porte. La coquille ne garde que le conteneur
 * et la silhouette : ce que l'écran contient n'a pas à s'afficher avant que la
 * porte ait répondu.
 */
export default function NewTournamentPage(props: Parameters<typeof NewTournamentPageContent>[0]) {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <EditorFormSkeleton fields={4} label="Chargement du formulaire" />
        </div>
      }
    >
      <NewTournamentPageContent {...props} />
    </Suspense>
  );
}
