/**
 * Utilitaires du thème d'Halloween.
 *
 * Deux questions distinctes, qu'il vaut mieux ne pas confondre :
 *
 * — *L'habillage est-il activé ?* C'est un réglage de déploiement,
 *   `NEXT_PUBLIC_THEME`, comme pour l'hiver. Il commande la palette.
 * — *Où en est-on dans la saison ?* C'est une affaire de dates, et elle
 *   commande l'intensité du décor : les derniers jours d'octobre méritent
 *   tout le cimetière, le reste du mois se contente de la palette et des
 *   toiles.
 *
 * Séparer les deux permet d'allumer l'habillage à l'avance sans que le site
 * soit couvert de citrouilles dès le 1er, et de le couper d'un réglage si la
 * saison tourne mal.
 */

import { DateTime } from "luxon";

/** Fuseau de référence de la plateforme, comme partout ailleurs dans l'app. */
const ZONE = "Europe/Paris";

/**
 * La saison court sur tout octobre ; le décor complet est réservé à la
 * dernière semaine, celle où les lieux ouvrent tard.
 *
 * Les bornes sont inclusives et exprimées en jours du mois : la saison est
 * ancrée sur octobre, pas sur une année. Elle revient donc d'elle-même sans
 * qu'on ait à repousser une date chaque automne.
 */
export const SEASON = {
  month: 10,
  firstDay: 1,
  lastDay: 31,
  /** Premier jour du décor complet. */
  fullDecorFromDay: 24,
} as const;

export type DecorLevel = "complet" | "discret" | "aucun";

/** L'habillage est-il activé sur ce déploiement ? */
export function isHalloweenTheme(): boolean {
  return process.env.NEXT_PUBLIC_THEME === "halloween";
}

/**
 * La date tombe-t-elle dans la saison ?
 *
 * @param now - Instant à situer. Par défaut, maintenant.
 */
export function isInSeason(now: DateTime = DateTime.now().setZone(ZONE)): boolean {
  const local = now.setZone(ZONE);
  return (
    local.month === SEASON.month &&
    local.day >= SEASON.firstDay &&
    local.day <= SEASON.lastDay
  );
}

/**
 * L'intensité du décor à cet instant.
 *
 * Hors saison, « aucun » : l'habillage peut rester activé toute l'année sans
 * que le décor sorte. Ce sont les couleurs qui restent, pas les chauves-souris.
 */
export function decorLevelAt(
  now: DateTime = DateTime.now().setZone(ZONE)
): DecorLevel {
  if (!isInSeason(now)) return "aucun";
  return now.setZone(ZONE).day >= SEASON.fullDecorFromDay ? "complet" : "discret";
}

/**
 * Les bornes de la saison autour d'une date, pour interroger la base.
 *
 * Renvoie des instants, pas des jours : le premier octobre à minuit et le
 * dernier instant du 31, dans le fuseau de la plateforme. Un événement du 31
 * au soir doit compter.
 *
 * Hors saison, on renvoie les bornes de la saison de l'année *en cours* :
 * après le 31 octobre, c'est bien celle qui vient de s'achever qui intéresse
 * l'utilisateur — son bilan, pas une saison vide onze mois durant.
 */
export function seasonBounds(now: DateTime = DateTime.now().setZone(ZONE)): {
  start: DateTime;
  end: DateTime;
} {
  const local = now.setZone(ZONE);
  const start = DateTime.fromObject(
    { year: local.year, month: SEASON.month, day: SEASON.firstDay },
    { zone: ZONE }
  ).startOf("day");

  return { start, end: start.endOf("month") };
}
