import 'server-only';

import { DateTime } from "luxon";
import { notifyUser } from "@/lib/services/notifications";
import type { Tournament, TournamentMatch, TournamentPlayer, TournamentRound } from "@/lib/types/Tournament";

/**
 * Notifications des rondes asynchrones.
 *
 * Une ronde jouée sur place n'a besoin de rien : les joueurs sont dans la
 * salle. Un intervalle de ligue, lui, court sur plusieurs jours — sans message,
 * un joueur peut ne jamais apprendre qu'il a été apparié.
 *
 * Seuls les joueurs rattachés à un compte sont joignables : un invité rejoint
 * par code n'a pas d'inbox. Les envois sont donc toujours partiels par nature,
 * et jamais bloquants : un échec de notification ne doit pas faire échouer la
 * création d'une ronde.
 */

/** Délai avant l'échéance à partir duquel une relance est envoyée. */
export const REMINDER_LEAD_HOURS = 24;

function formatDeadline(deadlineAt: Date): string {
  return DateTime.fromJSDate(deadlineAt).setLocale("fr").toFormat("cccc d LLLL à HH'h'mm");
}

/**
 * Prévient chaque joueur apparié de l'ouverture d'un intervalle : contre qui il
 * joue et jusqu'à quand. C'est le message qui déclenche la prise de contact
 * entre les deux joueurs.
 */
export async function notifyRoundOpened(
  tournament: Tournament,
  round: TournamentRound,
  matches: TournamentMatch[],
  players: TournamentPlayer[]
): Promise<void> {
  const playersById = new Map(players.map((p) => [p.id, p]));
  const deadline = round.deadlineAt ? formatDeadline(round.deadlineAt) : null;

  await Promise.all(
    matches.flatMap((match) => {
      // Un BYE n'appelle pas de prise de contact.
      if (match.players.length < 2) return [];
      return match.players.map(async (matchPlayer) => {
        const player = playersById.get(matchPlayer.playerId);
        if (!player?.userId) return;
        const opponents = match.players
          .filter((p) => p.playerId !== matchPlayer.playerId)
          .map((p) => playersById.get(p.playerId)?.displayName ?? "un adversaire")
          .join(", ");
        const scenario = round.scenario ? ` Scénario : ${round.scenario.name}.` : "";
        await notifyUser(
          player.userId,
          `${tournament.name} — intervalle ${round.number}`,
          deadline
            ? `Vous affrontez ${opponents}. Organisez votre partie et rapportez le résultat avant le ${deadline}.${scenario}`
            : `Vous affrontez ${opponents}. Organisez votre partie et rapportez le résultat.${scenario}`
        );
      });
    })
  );
}

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
            : `Votre match de l'intervalle ${round.number} n'a pas encore de résultat.`
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
        `${pendingCount} match(s) sans résultat. Clôturez l'intervalle ou accordez un délai depuis le portail organisateur.`
      )
    )
  );
}
