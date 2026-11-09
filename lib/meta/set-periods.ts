/**
 * Les périodes des winrates : de la sortie d'une extension à la veille de la
 * suivante. Les dates de sortie se règlent par jeu (`setReleases`).
 */

export type SetPeriod = {
  setCode: string;
  name: string;
  /** Premier jour, `AAAA-MM-JJ`. */
  from: string;
  /** Dernier jour, la veille de la sortie suivante ; absent pour l'extension en cours. */
  to?: string;
};

function dayBefore(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** Les périodes des extensions datées, de la plus récente à la plus ancienne. */
export function setPeriods(releases: Record<string, string>, names: Record<string, string> = {}): SetPeriod[] {
  const sorted = Object.entries(releases).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  return sorted
    .map(([setCode, from], index) => {
      const next = sorted.slice(index + 1).find((entry) => entry[1] > from);
      return { setCode, name: names[setCode] ?? setCode, from, ...(next ? { to: dayBefore(next[1]) } : {}) };
    })
    .reverse();
}

/** La période en cours au jour donné : la dernière extension sortie. */
export function currentSetPeriod(periods: SetPeriod[], today: string): SetPeriod | undefined {
  return periods.find((period) => period.from <= today);
}
