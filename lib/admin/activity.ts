/**
 * Les chiffres de l'accueil de l'administration, sans accès à la base : la
 * découpe d'une période en barres et la comparaison avec la période d'avant.
 *
 * Module pur pour pouvoir être testé : `lib/db/admin-activity.ts` ouvre une
 * connexion MongoDB au chargement.
 */

export const ACTIVITY_PERIODS = { week: 7, month: 30 } as const;
export type ActivityPeriod = keyof typeof ACTIVITY_PERIODS;

/** Le nombre de barres de chaque mini-graphique. */
export const ACTIVITY_BUCKETS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type ActivityWindow = {
  /** Début de la période précédente : on lit les deux périodes d'un coup. */
  previousStart: Date;
  start: Date;
  end: Date;
  bucketMs: number;
};

export function activityWindow(period: ActivityPeriod, now: Date): ActivityWindow {
  const length = ACTIVITY_PERIODS[period] * DAY_MS;
  return {
    previousStart: new Date(now.getTime() - 2 * length),
    start: new Date(now.getTime() - length),
    end: now,
    bucketMs: length / ACTIVITY_BUCKETS,
  };
}

export type ActivitySeries = {
  total: number;
  previous: number;
  /** `ACTIVITY_BUCKETS` valeurs, de la plus ancienne à la plus récente. */
  buckets: number[];
};

/**
 * Range des dates dans la période courante (et compte celles de la période
 * précédente), barre par barre.
 */
export function summarizeActivity(dates: Date[], window: ActivityWindow): ActivitySeries {
  const buckets = Array.from({ length: ACTIVITY_BUCKETS }, () => 0);
  let previous = 0;

  for (const date of dates) {
    const time = date.getTime();
    if (time >= window.start.getTime() && time <= window.end.getTime()) {
      const index = Math.min(
        ACTIVITY_BUCKETS - 1,
        Math.floor((time - window.start.getTime()) / window.bucketMs)
      );
      buckets[index]++;
    } else if (time >= window.previousStart.getTime() && time < window.start.getTime()) {
      previous++;
    }
  }

  return { total: buckets.reduce((sum, value) => sum + value, 0), previous, buckets };
}

/** « +12 sur la période précédente », « −3 … », « Autant que … ». */
export function describeActivityDelta(series: ActivitySeries, period: ActivityPeriod): string {
  const delta = series.total - series.previous;
  if (delta === 0) {
    return period === "week" ? "Autant que la semaine d'avant" : "Autant que les 30 jours d'avant";
  }
  const reference = period === "week" ? "à la semaine d'avant" : "aux 30 jours d'avant";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)} par rapport ${reference}`;
}
