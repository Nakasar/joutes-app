import { DateTime } from "luxon";
import type { LairOpeningHours } from "@/lib/types/Lair";

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const DAY = 24 * 60;

/**
 * Le nombre de plages qu'un même jour peut porter.
 *
 * Trois suffisent au cas réel — matin, après-midi, soirée. Au-delà, ce n'est
 * plus un horaire d'ouverture mais un agenda, et la carte de la vitrine, qui
 * tient sur sept lignes, cesse de se lire d'un coup d'œil.
 */
export const MAX_OPENING_RANGES_PER_DAY = 3;

function minutesOf(time: string | undefined): number | null {
  const match = time && TIME.exec(time.trim());
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Le jour ISO d'une plage : 1 = lundi … 7 = dimanche, la numérotation de luxon.
 *
 * Les horaires écrits avant que cette numérotation soit fixée portent `0` pour
 * le dimanche — celle de `Date#getDay`. Les laisser tels quels effaçait le
 * dimanche de la vitrine : la semaine se compose de 1 à 7, et un jour `0` n'y
 * trouvait aucune ligne où s'afficher. Ils sont ramenés ici, à la lecture,
 * plutôt que par une migration : la conversion est totale et sans perte.
 */
export function isoDay(day: number): number {
  return day === 0 ? 7 : day;
}

/** La plage est-elle exploitable — a-t-elle au moins une heure d'ouverture ? */
function isOpenRange(hours: LairOpeningHours): boolean {
  return minutesOf(hours.open) !== null;
}

/**
 * Les plages d'un jour donné, dans l'ordre de la journée.
 *
 * Plusieurs plages pour un même jour décrivent une coupure — « 10h — 12h » puis
 * « 14h — 19h ». L'ordre de la liste enregistrée n'est pas garanti : c'est
 * l'heure d'ouverture qui range.
 */
export function rangesOfDay(
  openingHours: LairOpeningHours[] | undefined,
  day: number,
): LairOpeningHours[] {
  return (openingHours ?? [])
    .filter((hours) => isoDay(hours.day) === day && isOpenRange(hours))
    .sort((a, b) => (minutesOf(a.open) ?? 0) - (minutesOf(b.open) ?? 0));
}

export type LairOpeningState = {
  /** Le lieu est-il ouvert à l'instant ? `null` si les horaires sont inconnus. */
  isOpen: boolean | null;
  /** Les plages du jour, dans l'ordre. Vide si le lieu n'ouvre pas aujourd'hui. */
  today: LairOpeningHours[];
  /** Le jour ISO courant, pour reconnaître sa ligne dans la semaine. */
  todayDay: number;
  /**
   * L'heure de fermeture de la plage **en cours**, « 19h » / « 19h30 », pour la
   * ligne de bannière. `null` quand le lieu est fermé.
   */
  closesAt: string | null;
};

/**
 * Formate une heure d'ouverture à la française : « 10h », « 19h30 ».
 *
 * Sur les autres langues, le séparateur horaire local reprend la main — un
 * anglophone lit « 7:30 PM » et non « 19h30 ».
 */
export function formatOpeningTime(time: string | undefined, locale: string): string | null {
  const minutes = minutesOf(time);
  if (minutes === null) {
    return null;
  }

  const moment = DateTime.fromObject(
    { hour: Math.floor(minutes / 60), minute: minutes % 60 },
    { locale },
  );

  if (locale.startsWith("fr")) {
    return moment.minute === 0 ? `${moment.hour}h` : moment.toFormat("H'h'mm");
  }

  return moment.toLocaleString(
    moment.minute === 0 ? { hour: "numeric" } : DateTime.TIME_SIMPLE,
  );
}

/** Une plage, « 10h — 19h », ou `null` si elle ne porte pas d'heure d'ouverture. */
export function formatOpeningRange(hours: LairOpeningHours | undefined, locale: string): string | null {
  const open = formatOpeningTime(hours?.open, locale);
  const close = formatOpeningTime(hours?.close, locale);

  if (!open) {
    return null;
  }

  return close ? `${open} — ${close}` : open;
}

/** Les plages d'un jour, formatées : `["10h — 12h", "14h — 19h"]`. */
export function formatOpeningRanges(hours: LairOpeningHours[], locale: string): string[] {
  return hours.flatMap((range) => {
    const formatted = formatOpeningRange(range, locale);
    return formatted ? [formatted] : [];
  });
}

/**
 * La plage court-elle à `minutes`, comptées depuis minuit du jour de la plage ?
 *
 * Une plage qui se termine avant son début — « 20h — 02h » — est lue comme
 * débordant sur le lendemain : c'est le cas d'un lieu qui ferme après minuit,
 * et le traiter autrement le déclarerait fermé toute la soirée.
 */
function isWithin(hours: LairOpeningHours, minutes: number): boolean {
  const open = minutesOf(hours.open);
  const close = minutesOf(hours.close);
  if (open === null || close === null) {
    return false;
  }

  const end = close <= open ? close + DAY : close;
  return minutes >= open && minutes < end;
}

/**
 * L'état d'ouverture du lieu, maintenant.
 *
 * Sur des horaires coupés, c'est la plage **en cours** qui donne l'heure de
 * fermeture annoncée : à 11h, un lieu ouvert « 10h — 12h » puis « 14h — 19h »
 * ferme à 12h, et promettre 19h enverrait le visiteur devant une porte close.
 */
export function readOpeningState(
  openingHours: LairOpeningHours[] | undefined,
  locale: string,
  now: DateTime = DateTime.now(),
): LairOpeningState {
  const todayDay = now.weekday;

  if (!openingHours || openingHours.length === 0) {
    return { isOpen: null, today: [], todayDay, closesAt: null };
  }

  const today = rangesOfDay(openingHours, todayDay);
  const yesterday = rangesOfDay(openingHours, todayDay === 1 ? 7 : todayDay - 1);

  const nowMinutes = now.hour * 60 + now.minute;

  // La veille compte aussi : sa dernière plage peut déborder sur la nuit, et
  // c'est alors elle qui tient le lieu ouvert à 1h du matin.
  const current =
    today.find((hours) => isWithin(hours, nowMinutes)) ??
    yesterday.find((hours) => isWithin(hours, nowMinutes + DAY)) ??
    null;

  return {
    isOpen: current !== null,
    today,
    todayDay,
    closesAt: current ? formatOpeningTime(current.close, locale) : null,
  };
}

/** Un jour de la semaine et ses plages — vides quand le lieu est fermé. */
export type LairOpeningDay = {
  /** Jour ISO : 1 = lundi … 7 = dimanche. */
  day: number;
  ranges: LairOpeningHours[];
};

/** Les sept jours, dans l'ordre de la semaine, complétés par les jours fermés. */
export function weekOf(openingHours: LairOpeningHours[] | undefined): LairOpeningDay[] {
  return [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, ranges: rangesOfDay(openingHours, day) }));
}

/**
 * Le premier jour dont les plages se chevauchent, s'il y en a un.
 *
 * Deux plages qui se recouvrent — « 10h — 14h » et « 12h — 19h » — ne décrivent
 * pas une coupure mais une saisie ratée : le lieu voulait fermer à 12h. Le cas
 * est refusé à l'écriture plutôt que rendu tel quel, où il se lirait comme deux
 * ouvertures distinctes.
 *
 * Une plage qui déborde sur le lendemain ne peut être que la dernière du jour :
 * ce qui la suivrait tomberait dans la nuit qu'elle occupe déjà. Et la nuit
 * qu'elle occupe court sur le jour suivant : « lundi 22h — 12h » tient encore
 * le lieu ouvert mardi midi, si bien qu'un « mardi 6h — 8h » lui répondrait par
 * deux ouvertures contradictoires. Deux plages qui se **touchent** — « 10h —
 * 12h » puis « 12h — 19h », ou une nuit qui finit à l'heure où le jour ouvre —
 * ne se chevauchent pas et restent acceptées.
 */
export function findOverlappingDay(openingHours: LairOpeningHours[]): number | null {
  const days = new Set(openingHours.map((hours) => isoDay(hours.day)));

  for (const day of days) {
    const ranges = rangesOfDay(openingHours, day);

    for (let index = 1; index < ranges.length; index += 1) {
      const previousOpen = minutesOf(ranges[index - 1].open);
      const previousClose = minutesOf(ranges[index - 1].close);
      const open = minutesOf(ranges[index].open);

      if (previousOpen === null || previousClose === null || open === null) {
        continue;
      }

      if (previousClose <= previousOpen || open < previousClose) {
        return day;
      }
    }

    // La dernière plage du jour, quand elle passe minuit, est à confronter au
    // lendemain : son heure de fermeture est déjà une heure du jour suivant.
    const last = ranges[ranges.length - 1];
    const lastOpen = minutesOf(last?.open);
    const lastClose = minutesOf(last?.close);

    if (lastOpen === null || lastClose === null || lastClose > lastOpen) {
      continue;
    }

    const tomorrow = minutesOf(rangesOfDay(openingHours, day === 7 ? 1 : day + 1)[0]?.open);

    if (tomorrow !== null && tomorrow < lastClose) {
      return day;
    }
  }

  return null;
}
