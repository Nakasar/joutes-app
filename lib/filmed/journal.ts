import type { DeviationKind } from "@/lib/filmed/types";

/**
 * Le journal d'une partie filmée et le rapport qu'on en tire. Fonctions pures :
 * la page y verse ce que le suivi lui rend, le rapport se calcule à la fin.
 */

export type EntryKind = "explained" | "question" | "deviation" | "forced" | "note" | "score";

export type Entry = {
  id: number;
  /** Secondes depuis le début du suivi (ou de la vidéo). */
  time: number;
  turn: number;
  /** Le joueur dont c'est le tour. */
  seat: number;
  kind: EntryKind;
  /** Le récit : une phrase par ligne. */
  lines: string[];
  /** Pour un écart : sa nature, son titre, la règle citée. */
  deviation?: { kind: DeviationKind; title: string; rule: string | null; reason: string | null };
  /** Comment un écart ou une question s'est terminé, et quand. */
  resolution?: "repaired" | "table" | "answered" | "superseded";
  resolvedAt?: number;
  /** L'image de la table à cet instant (adresse locale au navigateur). */
  shot?: string;
};

export type TurnSegment = { turn: number; seat: number; start: number; end: number };

export type Report = {
  /** Secondes entre la première et la dernière entrée. */
  duration: number;
  turns: number;
  deviations: number;
  repaired: number;
  tableRight: number;
  questions: number;
  /** Part des changements de table expliqués sans question ni écart, de 0 à 100. */
  explainedShare: number;
  segments: TurnSegment[];
};

/** `754` → `12:34`. */
export function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Les entrées d'un même tour, dans l'ordre : `[{ turn, seat, entries }]`. */
export function byTurn(entries: Entry[]): { turn: number; seat: number; entries: Entry[] }[] {
  const groups: { turn: number; seat: number; entries: Entry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last && last.turn === entry.turn && last.seat === entry.seat) last.entries.push(entry);
    else groups.push({ turn: entry.turn, seat: entry.seat, entries: [entry] });
  }
  return groups;
}

export function reportOf(entries: Entry[], end: number): Report {
  const moves = entries.filter((entry) => entry.kind === "explained" || entry.kind === "question" || entry.kind === "deviation");
  const explained = moves.filter((entry) => entry.kind === "explained").length;
  const deviations = entries.filter((entry) => entry.kind === "deviation");
  const start = entries[0]?.time ?? 0;
  const groups = byTurn(entries);
  const segments = groups.map((group, index) => ({
    turn: group.turn,
    seat: group.seat,
    start: group.entries[0].time,
    end: groups[index + 1]?.entries[0].time ?? Math.max(end, group.entries[group.entries.length - 1].time),
  }));
  return {
    duration: Math.max(0, end - start),
    turns: new Set(entries.map((entry) => entry.turn)).size,
    deviations: deviations.length,
    repaired: deviations.filter((entry) => entry.resolution === "repaired").length,
    tableRight: deviations.filter((entry) => entry.resolution === "table").length,
    questions: entries.filter((entry) => entry.kind === "question").length,
    explainedShare: moves.length === 0 ? 0 : Math.round((explained / moves.length) * 100),
    segments,
  };
}

/** Le journal tel qu'on l'exporte : sans les adresses d'images, qui ne valent que dans cet onglet. */
export function exportJournal(entries: Entry[], meta: Record<string, unknown>): string {
  return JSON.stringify(
    {
      ...meta,
      entries: entries.map((entry) => {
        const copy: Partial<Entry> = { ...entry };
        delete copy.shot;
        return copy;
      }),
    },
    null,
    2,
  );
}
