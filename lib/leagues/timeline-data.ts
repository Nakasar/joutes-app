import "server-only";

import { getGameSummariesByIds } from "@/lib/db/games";
import {
  getLeagueById,
  getLeagueTournamentFeats,
  getLeagueTournamentPoints,
} from "@/lib/db/leagues";
import { getStandings, listTournamentsByLeagueId } from "@/lib/db/tournaments";
import { getUsersByIds } from "@/lib/db/users";
import type { User } from "@/lib/types/User";
import {
  formatRecord,
  groupByYear,
  playerInitials,
  playerLabel,
  rankLabel,
  sortNewestFirst,
  yearOf,
  type TimelineEntry,
  type TimelinePlayer,
  type TimelineYearGroup,
} from "@/lib/leagues/timeline";

/**
 * Rassemble ce que la timeline d'une ligue a besoin d'afficher.
 *
 * Lit les deux domaines — les tournois pour le classement, la ligue pour les
 * points et les hauts faits — et confie toute la mise en forme au module pur
 * `timeline.ts`. Rien ici ne décide : on assemble.
 */

const PODIUM_SIZE = 3;

export async function getLeagueTimeline(leagueId: string): Promise<TimelineYearGroup[]> {
  // La ligue est lue SANS ses participants : on n'a besoin que du catalogue de
  // hauts faits, et les charger entraînerait une requête de feats par
  // participant pour une donnée déjà obtenue autrement.
  const [tournaments, league, tournamentFeats, pointsByTournament] = await Promise.all([
    listTournamentsByLeagueId(leagueId),
    getLeagueById(leagueId),
    getLeagueTournamentFeats(leagueId),
    getLeagueTournamentPoints(leagueId),
  ]);

  // Un brouillon n'est pas encore une étape de la saison : il n'a ni date
  // publique ni résultat, et n'a rien à raconter sur une timeline.
  const visible = tournaments.filter((tournament) => tournament.status !== "draft");
  if (visible.length === 0) return [];

  // Les seuls jeux cités, et seulement leur nom : charger le catalogue entier
  // pour en tirer trois libellés se paie sur chaque affichage de la page.
  const games = await getGameSummariesByIds([
    ...new Set(visible.map((tournament) => tournament.gameId).filter((id): id is string => Boolean(id))),
  ]);
  const gameNames = new Map(games.map((game) => [game.id, game.name]));
  const featTitles = new Map(
    (league?.pointsConfig?.pointsRules.feats ?? []).map((feat) => [feat.id, feat.title])
  );

  const featsByTournament = new Map<string, { userId: string; featId: string }[]>();
  for (const award of tournamentFeats) {
    const list = featsByTournament.get(award.tournamentId) ?? [];
    list.push({ userId: award.userId, featId: award.featId });
    featsByTournament.set(award.tournamentId, list);
  }

  // Un classement par tournoi : il se recalcule, il ne se lit pas. C'est le
  // coût de cette page, et la raison pour laquelle elle vit à part plutôt que
  // dans la page de ligue.
  const standingsByTournament = new Map(
    await Promise.all(
      visible.map(
        async (tournament) =>
          [tournament.id, await getStandings(tournament.id)] as const
      )
    )
  );

  // Tous les comptes cités, en une requête : podiums et hauts faits confondus.
  const userIds = new Set<string>();
  for (const standings of standingsByTournament.values()) {
    standings.slice(0, PODIUM_SIZE).forEach((s) => s.userId && userIds.add(s.userId));
  }
  for (const awards of featsByTournament.values()) {
    awards.forEach((award) => userIds.add(award.userId));
  }
  const usersById = new Map(
    (await getUsersByIds([...userIds])).map((user: User) => [user.id, user])
  );

  const entries: TimelineEntry[] = visible.map((tournament) => {
    const standings = standingsByTournament.get(tournament.id) ?? [];
    const date = tournament.startsAt ?? tournament.createdAt;

    const toPlayer = (standing: (typeof standings)[number]): TimelinePlayer => {
      const user = standing.userId ? usersById.get(standing.userId) : undefined;
      return {
        userId: standing.userId,
        // Un invité sans compte garde le nom sous lequel il a joué : c'est
        // celui que la salle a vu, et le seul qui existe.
        label: user ? playerLabel(user) : standing.displayName,
        avatar: user?.avatar,
        initials: user
          ? playerInitials(user)
          : playerInitials({ displayName: standing.displayName }),
      };
    };

    const podium = standings.slice(0, PODIUM_SIZE).map((standing, index) => ({
      ...toPlayer(standing),
      rank: index + 1,
      rankLabel: rankLabel(index + 1),
      record: formatRecord(standing),
      points: standing.matchPoints,
    }));

    // Pas de vainqueur tant que le tournoi n'est pas clos : le premier du
    // classement d'un tournoi en cours n'a encore rien gagné.
    const winner =
      tournament.status === "completed" && podium.length > 0
        ? { userId: podium[0].userId, label: podium[0].label, avatar: podium[0].avatar, initials: podium[0].initials }
        : null;

    const feats = (featsByTournament.get(tournament.id) ?? [])
      .map((award) => ({
        title: featTitles.get(award.featId),
        playerLabel: playerLabel(usersById.get(award.userId)),
      }))
      // Un haut fait retiré du catalogue depuis n'a plus de titre à montrer.
      .filter((feat): feat is { title: string; playerLabel: string } => Boolean(feat.title));

    return {
      tournamentId: tournament.id,
      name: tournament.name,
      status: tournament.status,
      date: date.toISOString(),
      year: yearOf(date),
      gameName: tournament.gameId ? gameNames.get(tournament.gameId) : tournament.customGameName,
      // `getStandings` rend exactement une ligne par joueur inscrit : le
      // nombre de joueurs s'y lit, sans requête de plus.
      playersCount: standings.length,
      points: pointsByTournament[tournament.id] ?? 0,
      winner,
      podium,
      feats,
    };
  });

  return groupByYear(sortNewestFirst(entries));
}
