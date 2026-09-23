import { DateTime } from "luxon";
import { formatPosterRef, parsePosterRef, type PosterChoice } from "@/lib/posters/references";

/**
 * Les affiches de la semaine, en message privé Discord — les règles.
 *
 * Un abonné Joutes Expert choisit quelques affiches (gardées, ou lieux qu'il
 * suit) ; chaque lundi matin, le bot les dessine pour la semaine qui commence
 * et les lui envoie. Le cron repasse plusieurs fois le lundi et ne traite
 * qu'une tranche d'abonnés à chaque fois : `lastSentWeek` dit qui a déjà eu la
 * sienne, et fait qu'un passage de plus n'envoie rien deux fois.
 *
 * Module pur : c'est ce qui le rend testable.
 */

/** Au plus, par envoi : un message Discord porte jusqu'à dix pièces jointes. */
export const MAX_DIGEST_POSTERS = 5;

/** La semaine ISO d'un instant, à l'heure de Paris : « 2026-W39 ». */
export function digestWeekKey(now: DateTime): string {
  const paris = now.setZone("Europe/Paris");
  return `${paris.weekYear}-W${String(paris.weekNumber).padStart(2, "0")}`;
}

/** L'envoi de cette semaine reste-t-il à faire ? */
export function isDigestDue(lastSentWeek: string | undefined, now: DateTime): boolean {
  return lastSentWeek !== digestWeekKey(now);
}

/**
 * Les références retenues : bien formées, sans doublon, parmi celles que le
 * compte peut vraiment afficher, et pas plus que le plafond.
 */
export function sanitizeDigestRefs(refs: readonly string[], available: readonly PosterChoice[]): string[] {
  const allowed = new Set(available.map((choice) => formatPosterRef(choice)));
  const kept: string[] = [];

  for (const value of refs) {
    const ref = parsePosterRef(value);
    if (!ref) continue;
    const formatted = formatPosterRef(ref);
    if (!allowed.has(formatted) || kept.includes(formatted)) continue;
    kept.push(formatted);
    if (kept.length === MAX_DIGEST_POSTERS) break;
  }

  return kept;
}

/**
 * Ajoute ou retire une affiche de l'envoi hebdomadaire, depuis l'affiche
 * elle-même. `"full"` quand le plafond est atteint : l'appelant le dit plutôt
 * que d'en retirer une autre à la place de l'abonné.
 */
export function toggleDigestRef(refs: readonly string[], ref: string, enabled: boolean): string[] | "full" {
  const without = refs.filter((value) => value !== ref);
  if (!enabled) return without;
  if (refs.includes(ref)) return [...refs];
  if (without.length >= MAX_DIGEST_POSTERS) return "full";
  return [...without, ref];
}
