/**
 * Qui est visé quand quelqu'un signale la fin d'un puzzle.
 *
 * Deux gestes distincts arrivent sur la même route :
 *
 *  - le portail joueur envoie un corps vide — « j'ai terminé » ;
 *  - le tableau de bord de l'organisation désigne un joueur — « celui-là a
 *    terminé », éventuellement avec un temps saisi à la main.
 *
 * C'est la présence du joueur désigné, et non le rôle de l'auteur, qui
 * distingue les deux : l'organisation joue souvent son propre tournoi, et son
 * « j'ai terminé le puzzle » doit viser son inscription à elle, comme pour
 * n'importe quel joueur.
 *
 * Module pur : c'est ce qui le rend testable, et `lib/db/*` ne l'est pas.
 */

export type PuzzleReportRequest = {
  /** Joueur désigné dans la requête, absent pour le geste du portail joueur. */
  playerId?: string;
  /** Temps saisi à la main, pour rattraper un relevé manqué. */
  durationSeconds?: number;
};

export type PuzzleReportActor = {
  /** Les inscriptions du tournoi que l'auteur de la requête incarne. */
  playerIds: string[];
  isOrganizer: boolean;
};

export type PuzzleReportPlan = {
  ok: true;
  playerId: string;
  /** Le temps vient du joueur lui-même, pas du chronomètre de l'organisation. */
  selfReported: boolean;
  /** Un temps déjà relevé peut être réécrit : la main de l'organisation. */
  overwrite: boolean;
};

export type PuzzleReportRefusal = {
  ok: false;
  kind: "forbidden" | "invalid";
  message: string;
};

export function planPuzzleReport(
  request: PuzzleReportRequest,
  actor: PuzzleReportActor,
  settings: { allowSelfReporting: boolean }
): PuzzleReportPlan | PuzzleReportRefusal {
  // Le joueur désigné : ce que la requête demande, sinon la propre inscription
  // de son auteur. Ce repli vaut aussi pour l'organisation qui joue.
  //
  // Une identité n'a qu'une inscription par tournoi — `addPlayer` refuse un
  // second `userId`, `joinTournament` rend celle qui existe déjà, et une clé de
  // synchronisation ne porte qu'un joueur — donc `playerIds[0]` désigne sans
  // ambiguïté, et ce repli n'a personne d'autre à départager.
  const designated = request.playerId !== undefined;

  if (!actor.isOrganizer) {
    if (!settings.allowSelfReporting) {
      return {
        ok: false,
        kind: "forbidden",
        message: "Le self-reporting est désactivé sur ce tournoi : voyez l'organisation",
      };
    }
    if (request.playerId && !actor.playerIds.includes(request.playerId)) {
      return {
        ok: false,
        kind: "forbidden",
        message: "Vous ne pouvez rapporter que votre propre temps",
      };
    }
  }

  // Un temps saisi à la main appartient au geste de l'organisation qui désigne :
  // c'est ainsi qu'on rattrape un relevé manqué, sur un joueur nommé. Un
  // « j'ai terminé » ne porte que l'instant où il arrive — y compris celui
  // d'une organisation qui joue, sans quoi elle inscrirait sous l'étiquette du
  // self-report un temps qu'elle a choisi.
  if (request.durationSeconds !== undefined) {
    if (!actor.isOrganizer) {
      return {
        ok: false,
        kind: "forbidden",
        message: "Seule l'organisation peut saisir un temps : signalez simplement la fin du puzzle",
      };
    }
    if (!designated) {
      return {
        ok: false,
        kind: "invalid",
        message: "Un temps saisi doit désigner le joueur auquel il s'applique",
      };
    }
  }

  const playerId = request.playerId ?? actor.playerIds[0];
  if (!playerId) {
    return {
      ok: false,
      kind: "invalid",
      message: "Aucun joueur désigné, et vous n'êtes pas inscrit à ce tournoi",
    };
  }

  return {
    ok: true,
    playerId,
    selfReported: !actor.isOrganizer || !designated,
    // Un puzzle ne se termine qu'une fois : personne ne réécrit son propre
    // temps, pas même l'organisation quand elle se signale comme joueuse.
    // Elle repointe qui elle veut depuis son tableau de bord, en désignant.
    overwrite: actor.isOrganizer && designated,
  };
}
