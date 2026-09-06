/**
 * Attribution des tables d'une phase de puzzle.
 *
 * Une phase puzzle n'a pas de match : rien n'y porte un numéro de table, et
 * pourtant chacun doit savoir où s'installer. Chaque joueur reçoit donc sa
 * table à lui — un siège par joueur, et non par affrontement.
 *
 * Les règles sont celles des matchs, transposées à un joueur seul :
 *
 *  - la table fixe d'un joueur prime, tant qu'elle n'est pas déjà prise ;
 *  - les autres prennent les numéros dans l'ordre, à partir de la première
 *    table réglée sur le tournoi, en sautant ceux déjà occupés ;
 *  - un joueur retiré n'a pas de table.
 *
 * Module pur : c'est ce qui le rend testable, et `lib/db/*` ne l'est pas.
 */

export type PuzzleSeatPlayer = {
  id: string;
  status: "registered" | "pre-registered" | "dropped";
  fixedTableNumber?: number;
};

export type PuzzleSeatAssignment = { playerId: string; tableNumber: number };

/** Borne des numéros de table, alignée sur celle des matchs. */
export const MAX_PUZZLE_TABLE_NUMBER = 9999;

export type PlanPuzzleSeatsInput = {
  /** Les joueurs du tournoi, dans l'ordre où les tables seront distribuées. */
  players: PuzzleSeatPlayer[];
  /** Les sièges déjà attribués sur la phase. */
  existing: PuzzleSeatAssignment[];
  /** Première table du tournoi (`settings.firstTableNumber`, défaut 1). */
  firstTable?: number;
  /**
   * `true` : tout est redistribué depuis le début, les sièges existants sont
   * ignorés. `false` : les joueurs déjà placés gardent leur table, seuls ceux
   * qui n'en ont pas en reçoivent une — c'est le geste pour un joueur arrivé
   * après la distribution.
   */
  reset: boolean;
};

export type PlanPuzzleSeatsResult = {
  /** L'ensemble des sièges après attribution, un par joueur actif placé. */
  seats: PuzzleSeatAssignment[];
  /** Les sièges nouveaux ou dont la table a changé : ceux qu'il faut annoncer. */
  changed: PuzzleSeatAssignment[];
};

/**
 * Distribue les tables. Les sièges d'un joueur retiré sont abandonnés dans
 * les deux modes : il n'est plus attendu dans la salle, et sa table redevient
 * disponible pour quelqu'un d'autre.
 */
export function planPuzzleSeats(input: PlanPuzzleSeatsInput): PlanPuzzleSeatsResult {
  const firstTable = Math.max(1, input.firstTable ?? 1);
  const active = input.players.filter((player) => player.status !== "dropped");
  const activeIds = new Set(active.map((player) => player.id));

  const previous = new Map(input.existing.map((seat) => [seat.playerId, seat.tableNumber]));
  const kept = new Map<string, number>();
  if (!input.reset) {
    for (const [playerId, tableNumber] of previous) {
      if (activeIds.has(playerId)) kept.set(playerId, tableNumber);
    }
  }

  const used = new Set<number>(kept.values());
  const assigned = new Map<string, number>(kept);

  // 1er passage : les tables fixes, pour ceux qui n'ont pas encore de siège.
  // Une table fixe déjà occupée n'est pas doublée : le joueur retombe alors
  // sur la numérotation séquentielle.
  for (const player of active) {
    if (assigned.has(player.id)) continue;
    const fixed = player.fixedTableNumber;
    if (typeof fixed !== "number" || fixed < 1 || used.has(fixed)) continue;
    assigned.set(player.id, fixed);
    used.add(fixed);
  }

  // 2e passage : numérotation séquentielle en sautant les tables prises.
  let next = firstTable;
  for (const player of active) {
    if (assigned.has(player.id)) continue;
    while (used.has(next)) next++;
    if (next > MAX_PUZZLE_TABLE_NUMBER) break;
    assigned.set(player.id, next);
    used.add(next);
  }

  const seats = active
    .filter((player) => assigned.has(player.id))
    .map((player) => ({ playerId: player.id, tableNumber: assigned.get(player.id) as number }));
  const changed = seats.filter((seat) => previous.get(seat.playerId) !== seat.tableNumber);

  return { seats, changed };
}
