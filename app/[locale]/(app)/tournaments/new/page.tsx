import { Suspense } from "react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getLeagueById, isLeagueOrganizer } from "@/lib/db/leagues.ts";
import { getEventById } from "@/lib/db/events.ts";
import { getTournamentByEventId } from "@/lib/db/tournaments.ts";
import { canManageEvent } from "@/lib/events/tournament-link.ts";
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
  searchParams: Promise<{ leagueId?: string; eventId?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const locale = await getLocale();

  // Création depuis la gestion d'une ligue. Le rattachement n'est proposé que
  // si l'utilisateur organise vraiment cette ligue : sinon on crée un tournoi
  // ordinaire plutôt que d'échouer à la dernière étape du tunnel.
  const { leagueId, eventId } = await searchParams;
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
  const allGames = await getAllGames();
  const games: WizardGame[] = allGames
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

  // Création depuis la page d'un événement. Même prudence que pour la ligue :
  // sans droit sur l'événement, ou s'il a déjà son tournoi, on crée un tournoi
  // ordinaire plutôt que d'échouer à la dernière étape. Le jeu est repris quand
  // l'événement en désigne un du catalogue.
  const event = eventId ? await getEventById(eventId).catch(() => null) : null;
  const linkedEvent =
    event && canManageEvent(event, session.user.id) && !(await getTournamentByEventId(event.id))
      ? {
          id: event.id,
          name: event.name,
          gameId: allGames.find(
            (game) =>
              (event.game?.slug && game.slug === event.game.slug) ||
              game.name.localeCompare(event.game?.name ?? event.gameName, locale, { sensitivity: "base" }) === 0
          )?.id,
        }
      : null;

  return <CreateTournamentWizard games={games} league={linkedLeague} event={linkedEvent} />;
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
