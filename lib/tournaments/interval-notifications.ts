import 'server-only';

import { notifyUser } from "@/lib/services/notifications";
import { formatDeadline, tournamentLink } from "@/lib/tournaments/notification-messages";
import type { Tournament, TournamentMatch, TournamentPlayer, TournamentRound } from "@/lib/types/Tournament";

/**
 * Les relances d'échéance des intervalles.
 *
 * Ce qui reste ici est ce qu'un intervalle est seul à connaître : une date
 * limite, et donc des relances. L'ouverture d'une ronde, elle, a rejoint
 * `notifications.ts` — c'est un seul événement, que la ronde soit jouée sur
 * place ou sur plusieurs jours.
 *
 * Ces deux fonctions sont pilotées par le cron `tournament-deadlines`. Comme
 * partout dans le domaine : seuls les joueurs rattachés à un compte sont
 * joignables, et un échec d'envoi n'est jamais bloquant.
 */

/** Délai avant l'échéance à partir duquel une relance est envoyée. */
export const REMINDER_LEAD_HOURS = 24;

/**
 * Relance les joueurs dont le match n'a toujours pas de résultat à l'approche
 * de l'échéance. N'est envoyée qu'une fois par ronde (voir `remindersSentAt`) :
 * repousser l'échéance rouvre le droit à une nouvelle relance.
 */
export async function notifyRoundDeadlineSoon(
  tournament: Tournament,
  round: TournamentRound,
  pendingMatches: TournamentMatch[],
  players: TournamentPlayer[]
): Promise<void> {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const deadline = round.deadlineAt ? formatDeadline(round.deadlineAt) : null;

  await Promise.all(
    pendingMatches.flatMap((match) =>
      match.players.map(async (matchPlayer) => {
        const player = playersById.get(matchPlayer.playerId);
        if (!player?.userId) return;
        await notifyUser(
          player.userId,
          `${tournament.name} — l'intervalle se termine bientôt`,
          deadline
            ? `Votre match de l'intervalle ${round.number} n'a pas encore de résultat. L'échéance est le ${deadline}.`
            : `Votre match de l'intervalle ${round.number} n'a pas encore de résultat.`,
          { link: tournamentLink(tournament.id) }
        );
      })
    )
  );
}

/**
 * Prévient l'organisation qu'un intervalle est arrivé à échéance avec des
 * matchs sans résultat. La clôture reste un geste de l'organisateur : le
 * document de ligue lui laisse explicitement la main pour accorder du temps.
 */
export async function notifyOrganizersDeadlineReached(
  tournament: Tournament,
  round: TournamentRound,
  pendingCount: number
): Promise<void> {
  const staffIds = [...new Set([...tournament.organizerIds, ...tournament.judgeIds])];
  await Promise.all(
    staffIds.map((userId) =>
      notifyUser(
        userId,
        `${tournament.name} — intervalle ${round.number} échu`,
        `${pendingCount} match(s) sans résultat. Clôturez l'intervalle ou accordez un délai depuis le portail organisateur.`,
        { link: tournamentLink(tournament.id) }
      )
    )
  );
}
