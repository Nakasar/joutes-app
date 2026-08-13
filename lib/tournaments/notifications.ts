import 'server-only';

import { notifyUser } from "@/lib/services/notifications";
import {
  announcementMessage,
  formatDeadline,
  resultDisputedMessage,
  resultToConfirmMessage,
  roundCompleteMessage,
  roundPairedMessage,
  tournamentLink,
  tournamentStatusMessage,
} from "@/lib/tournaments/notification-messages";
import type {
  Tournament,
  TournamentAnnouncementLevel,
  TournamentMatch,
  TournamentPlayer,
  TournamentRound,
} from "@/lib/types/Tournament";

/**
 * Les notifications d'un tournoi.
 *
 * Longtemps, seules les rondes **asynchrones** en recevaient : sur place, les
 * joueurs sont dans la salle et regardent l'écran de l'organisateur. Le push a
 * renversé l'argument — un téléphone qui vibre en poche vaut mieux qu'un écran
 * à aller consulter, même à trois mètres de la table.
 *
 * Deux règles traversent ce module :
 *
 *  - **seuls les joueurs rattachés à un compte sont joignables.** Un invité
 *    entré par code de tournoi n'a ni compte, ni inbox, ni appareil. Les envois
 *    sont donc partiels par nature, et ce n'est pas un défaut ;
 *  - **rien n'est bloquant.** Un échec d'envoi ne doit jamais faire échouer
 *    l'appariement d'une ronde ou la saisie d'un résultat. Les appelants
 *    enveloppent, et ces fonctions ne promettent rien d'autre qu'un
 *    best-effort.
 *
 * La mise en mots vit dans `notification-messages.ts`, qui est pur et testé.
 */

/** Un joueur joignable : inscrit, pas retiré, et rattaché à un compte. */
function isReachable(player: TournamentPlayer | undefined): player is TournamentPlayer & { userId: string } {
  return Boolean(player?.userId) && player?.status !== "dropped";
}

/** Les comptes de l'organisation, dédupliqués. */
function staffUserIds(tournament: Tournament): string[] {
  return [...new Set([...tournament.organizerIds, ...tournament.judgeIds])];
}

/**
 * Prévient chaque joueur apparié.
 *
 * Remplace l'ancien `notifyRoundOpened`, qui ne servait que les intervalles :
 * une ronde qui s'ouvre est un seul événement, quel qu'en soit le rythme. C'est
 * `round.deadlineAt` qui les distingue — seule une ronde asynchrone en porte
 * une.
 */
export async function notifyRoundPaired(
  tournament: Tournament,
  round: TournamentRound,
  matches: TournamentMatch[],
  players: TournamentPlayer[]
): Promise<void> {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const pacing = round.deadlineAt ? "asynchronous" : "live";
  const deadline = round.deadlineAt ? formatDeadline(round.deadlineAt) : undefined;
  const link = tournamentLink(tournament.id);

  await Promise.all(
    matches.flatMap((match) =>
      match.players.map(async (matchPlayer) => {
        const player = playersById.get(matchPlayer.playerId);
        if (!isReachable(player)) return;

        const opponents = match.players
          .filter((other) => other.playerId !== matchPlayer.playerId)
          .map((other) => playersById.get(other.playerId)?.displayName)
          .filter((name): name is string => Boolean(name));

        const { title, description } = roundPairedMessage({
          tournamentName: tournament.name,
          roundNumber: round.number,
          pacing,
          opponents,
          tableNumber: match.tableNumber,
          scenario: round.scenario?.name,
          deadline,
        });

        await notifyUser(player.userId, title, description, { link });
      })
    )
  );
}

/**
 * Diffuse une annonce de l'organisation à tous les joueurs inscrits.
 *
 * L'auteur en est écarté : un organisateur inscrit comme joueur — cas courant
 * dans un petit tournoi — recevrait sinon sa propre annonce sur son téléphone,
 * une seconde après l'avoir écrite.
 */
export async function notifyAnnouncement(
  tournament: Tournament,
  announcement: { message: string; level: TournamentAnnouncementLevel; createdBy?: string },
  players: TournamentPlayer[]
): Promise<void> {
  const { title, description } = announcementMessage({
    tournamentName: tournament.name,
    message: announcement.message,
    level: announcement.level,
  });
  const link = tournamentLink(tournament.id);

  await Promise.all(
    players
      .filter(isReachable)
      .filter((player) => player.userId !== announcement.createdBy)
      .map((player) => notifyUser(player.userId, title, description, { link }))
  );
}

/**
 * Invite l'adversaire à confirmer un résultat qu'il n'a pas saisi.
 *
 * `reporterIdentityIds` porte toutes les identités de celui qui a saisi — son
 * compte et ses identifiants de joueur. Le contrôle anti-auto-confirmation de
 * `confirmMatchResult` s'appuie sur le même ensemble : s'en servir ici évite de
 * demander à quelqu'un de confirmer son propre rapport.
 */
export async function notifyResultToConfirm(
  tournament: Tournament,
  match: TournamentMatch,
  players: TournamentPlayer[],
  reporter: { identityIds: string[]; name?: string }
): Promise<void> {
  const playersById = new Map(players.map((player) => [player.id, player]));
  const identities = new Set(reporter.identityIds);
  const { title, description } = resultToConfirmMessage({
    tournamentName: tournament.name,
    reporterName: reporter.name,
    tableNumber: match.tableNumber,
  });
  const link = tournamentLink(tournament.id);

  await Promise.all(
    match.players.map(async (matchPlayer) => {
      const player = playersById.get(matchPlayer.playerId);
      if (!isReachable(player)) return;
      if (identities.has(player.id) || identities.has(player.userId)) return;

      await notifyUser(player.userId, title, description, { link });
    })
  );
}

/** Prévient l'organisation qu'un résultat est contesté et attend son arbitrage. */
export async function notifyResultDisputed(
  tournament: Tournament,
  match: TournamentMatch
): Promise<void> {
  const { title, description } = resultDisputedMessage({
    tournamentName: tournament.name,
    tableNumber: match.tableNumber,
  });
  const link = tournamentLink(tournament.id);

  await Promise.all(
    staffUserIds(tournament).map((userId) => notifyUser(userId, title, description, { link }))
  );
}

/**
 * Prévient l'organisation que tous les résultats d'une ronde sont rentrés.
 *
 * C'est le moment où elle cesse d'avoir à surveiller son écran : le classement
 * peut être validé et la suite lancée.
 */
export async function notifyRoundComplete(
  tournament: Tournament,
  round: TournamentRound
): Promise<void> {
  const { title, description } = roundCompleteMessage({
    tournamentName: tournament.name,
    roundNumber: round.number,
  });
  const link = tournamentLink(tournament.id);

  await Promise.all(
    staffUserIds(tournament).map((userId) => notifyUser(userId, title, description, { link }))
  );
}

/** Annonce le démarrage ou la clôture du tournoi à tous les joueurs inscrits. */
export async function notifyTournamentStatus(
  tournament: Tournament,
  status: "in-progress" | "completed",
  players: TournamentPlayer[]
): Promise<void> {
  const { title, description } = tournamentStatusMessage({
    tournamentName: tournament.name,
    status,
  });
  const link = tournamentLink(tournament.id);

  await Promise.all(
    players
      .filter(isReachable)
      .map((player) => notifyUser(player.userId, title, description, { link }))
  );
}
