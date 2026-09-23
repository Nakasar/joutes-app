import { DateTime } from "luxon";

/**
 * Un événement a-t-il changé d'horaire, et comment le dire ?
 *
 * Les dates ne sont pas stockées dans une forme unique (`…Z` à la saisie,
 * `…+01:00` à l'import d'un agenda) : on compare des **instants**, jamais les
 * chaînes, faute de quoi une simple réécriture au même horaire passerait pour
 * un report.
 *
 * Module pur : c'est ce qui le rend testable.
 */

type Schedule = { startDateTime?: string; endDateTime?: string };

function instant(iso: string | undefined): number | null {
  if (!iso) return null;
  const parsed = DateTime.fromISO(iso);
  return parsed.isValid ? parsed.toMillis() : null;
}

/** Vrai quand le début ou la fin change réellement d'instant. */
export function hasScheduleChanged(before: Schedule, after: Schedule): boolean {
  const changed = (a?: string, b?: string) => {
    if (b === undefined) return false; // champ non modifié
    return instant(a) !== instant(b);
  };
  return changed(before.startDateTime, after.startDateTime) || changed(before.endDateTime, after.endDateTime);
}

/** « jeudi 1 octobre à 19:00 », à l'heure de Paris comme le reste du site. */
export function formatEventDate(iso: string): string {
  return DateTime.fromISO(iso).setZone("Europe/Paris").setLocale("fr").toFormat("cccc d LLLL 'à' HH:mm");
}

/** Le texte de la notification de report. */
export function rescheduleMessage(
  name: string,
  before: { startDateTime: string },
  after: { startDateTime: string }
): { title: string; description: string } {
  const sameStart = instant(before.startDateTime) === instant(after.startDateTime);
  return {
    title: "📅 Horaire modifié",
    description: sameStart
      ? `L'horaire de fin de « ${name} » a changé. Il commence toujours le ${formatEventDate(after.startDateTime)}.`
      : `« ${name} » est déplacé : il aura lieu le ${formatEventDate(after.startDateTime)} (au lieu du ${formatEventDate(before.startDateTime)}).`,
  };
}
