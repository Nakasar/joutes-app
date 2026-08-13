import { DateTime } from "luxon";

/**
 * Ce qu'une notification de tournoi dit, et où elle mène.
 *
 * Toute la mise en mots vit ici, sans base ni réseau : c'est la partie qui
 * mérite un test, et `lib/mongodb.ts` ouvrant une connexion à l'import, elle ne
 * peut pas cohabiter avec les envois.
 *
 * Un principe traverse ces messages : **ils sont lus sur un écran de
 * verrouillage, entre deux parties**. Le titre nomme le tournoi — sans quoi on
 * ne sait pas de quoi il s'agit quand on joue deux tournois le même week-end —
 * et le corps dit quoi faire, dans cet ordre : où aller, contre qui, avec
 * quelle contrainte de temps.
 */

export type TournamentPacing = "live" | "asynchronous";

export type NotificationMessage = { title: string; description: string };

/**
 * Où mène une notification de tournoi : la page du tournoi, et rien de plus
 * fin. L'application mobile n'a d'écran ni pour un match, ni pour une ronde ;
 * pointer vers eux ouvrirait une page blanche.
 */
export function tournamentLink(tournamentId: string): string {
  return `/tournaments/${tournamentId}`;
}

/** « jeudi 14 août à 18h30 » — la même forme que les relances d'intervalle. */
export function formatDeadline(deadlineAt: Date): string {
  return DateTime.fromJSDate(deadlineAt).setLocale("fr").toFormat("cccc d LLLL à HH'h'mm");
}

/** « Nakasar », « Nakasar et Kestrel », « Nakasar, Kestrel et Aria ». */
function joinNames(names: string[]): string {
  if (names.length === 0) return "un adversaire";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
}

export type RoundPairedInput = {
  tournamentName: string;
  roundNumber: number;
  pacing: TournamentPacing;
  /** Vide pour un BYE. */
  opponents: string[];
  tableNumber?: number;
  scenario?: string;
  /** Uniquement sur un intervalle. */
  deadline?: string;
};

/**
 * L'appariement d'une ronde.
 *
 * Les deux rythmes disent des choses différentes parce qu'ils demandent des
 * choses différentes. Sur place, la question est « où est ma table » ; sur un
 * intervalle, c'est « jusqu'à quand ai-je pour jouer ». D'où deux corps, un
 * seul point d'entrée.
 *
 * Le BYE a droit à son message. L'ancien code l'écartait, ce qui se défend pour
 * un intervalle — il n'y a rien à organiser. Sur place c'est l'inverse : savoir
 * qu'on est exempt est justement ce qui permet d'aller prendre un café au lieu
 * de chercher sa table.
 */
export function roundPairedMessage(input: RoundPairedInput): NotificationMessage {
  const scenario = input.scenario ? ` Scénario : ${input.scenario}.` : "";
  const isBye = input.opponents.length === 0;

  if (input.pacing === "asynchronous") {
    const title = `${input.tournamentName} — intervalle ${input.roundNumber}`;

    if (isBye) {
      return { title, description: `Vous êtes exempt de cet intervalle.${scenario}` };
    }

    const opponents = joinNames(input.opponents);
    return {
      title,
      description: input.deadline
        ? `Vous affrontez ${opponents}. Organisez votre partie et rapportez le résultat avant le ${input.deadline}.${scenario}`
        : `Vous affrontez ${opponents}. Organisez votre partie et rapportez le résultat.${scenario}`,
    };
  }

  const title = `${input.tournamentName} — ronde ${input.roundNumber}`;

  if (isBye) {
    return { title, description: `Vous êtes exempt de cette ronde.${scenario}` };
  }

  // Le numéro de table d'abord : c'est l'information qui fait se lever.
  const table = input.tableNumber ? `Table ${input.tableNumber} — v` : "V";
  return {
    title,
    description: `${table}ous affrontez ${joinNames(input.opponents)}.${scenario}`,
  };
}

/**
 * Une annonce de l'organisation.
 *
 * Le message est repris tel quel : c'est l'organisateur qui l'a écrit, et le
 * reformuler trahirait son intention. Une annonce urgente se signale dans le
 * titre — c'est la seule partie qu'on lit à coup sûr, notification repliée.
 */
export function announcementMessage(input: {
  tournamentName: string;
  message: string;
  level: "info" | "urgent";
}): NotificationMessage {
  return {
    title:
      input.level === "urgent"
        ? `🚨 ${input.tournamentName} — annonce`
        : `${input.tournamentName} — annonce`,
    description: input.message,
  };
}

/**
 * Un adversaire a saisi le résultat, il reste à le confirmer.
 *
 * Le message nomme qui a saisi : c'est ce qui permet au destinataire de savoir
 * s'il doit vérifier ou simplement valider.
 */
export function resultToConfirmMessage(input: {
  tournamentName: string;
  reporterName?: string;
  tableNumber?: number;
}): NotificationMessage {
  const who = input.reporterName ?? "Votre adversaire";
  const where = input.tableNumber ? ` de la table ${input.tableNumber}` : "";

  return {
    title: `${input.tournamentName} — résultat à confirmer`,
    description: `${who} a saisi le résultat de votre match${where}. Confirmez-le pour qu'il soit pris en compte.`,
  };
}

/** Un résultat contesté : l'arbitrage doit trancher. */
export function resultDisputedMessage(input: {
  tournamentName: string;
  tableNumber?: number;
}): NotificationMessage {
  const where = input.tableNumber ? `Table ${input.tableNumber} : le` : "Le";

  return {
    title: `${input.tournamentName} — résultat contesté`,
    description: `${where} résultat d'un match est contesté et attend votre arbitrage.`,
  };
}

/**
 * Tous les résultats d'une ronde sont rentrés.
 *
 * C'est le signal que l'organisation attend pour valider le classement et
 * enchaîner — le moment où elle cesse d'avoir à surveiller son écran.
 */
export function roundCompleteMessage(input: {
  tournamentName: string;
  roundNumber: number;
}): NotificationMessage {
  return {
    title: `${input.tournamentName} — ronde ${input.roundNumber} complète`,
    description: "Tous les résultats sont rentrés. Vous pouvez valider le classement et lancer la suite.",
  };
}

/** Le tournoi démarre, ou s'achève. */
export function tournamentStatusMessage(input: {
  tournamentName: string;
  status: "in-progress" | "completed";
}): NotificationMessage {
  if (input.status === "completed") {
    return {
      title: `${input.tournamentName} — terminé`,
      description: "Le tournoi est clos. Le classement final est disponible.",
    };
  }

  return {
    title: `${input.tournamentName} — c'est parti`,
    description: "Le tournoi a commencé. Les appariements arrivent.",
  };
}
