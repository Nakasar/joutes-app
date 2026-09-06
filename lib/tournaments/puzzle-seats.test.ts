import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planPuzzleSeats, type PuzzleSeatPlayer } from "./puzzle-seats";

/**
 * Tests de l'attribution des tables de puzzle.
 *
 * Exécution : `npm run test`.
 */

const player = (id: string, extra: Partial<PuzzleSeatPlayer> = {}): PuzzleSeatPlayer => ({
  id,
  status: "registered",
  ...extra,
});

describe("planPuzzleSeats", () => {
  it("donne une table par joueur, dans l'ordre, à partir de la première table", () => {
    const { seats, changed } = planPuzzleSeats({
      players: [player("a"), player("b"), player("c")],
      existing: [],
      firstTable: 10,
      reset: false,
    });

    assert.deepEqual(seats, [
      { playerId: "a", tableNumber: 10 },
      { playerId: "b", tableNumber: 11 },
      { playerId: "c", tableNumber: 12 },
    ]);
    assert.deepEqual(changed, seats);
  });

  it("laisse les joueurs retirés sans table et libère la leur", () => {
    const { seats } = planPuzzleSeats({
      players: [player("a"), player("b", { status: "dropped" }), player("c")],
      existing: [{ playerId: "b", tableNumber: 1 }],
      reset: false,
    });

    assert.deepEqual(seats, [
      { playerId: "a", tableNumber: 1 },
      { playerId: "c", tableNumber: 2 },
    ]);
  });

  it("fait primer la table fixe, sauf si elle est déjà prise", () => {
    const { seats } = planPuzzleSeats({
      players: [
        player("a"),
        player("b", { fixedTableNumber: 1 }),
        player("c", { fixedTableNumber: 1 }),
      ],
      existing: [],
      reset: false,
    });

    // b prend sa table fixe ; a et c suivent dans l'ordre, en sautant la 1.
    assert.deepEqual(seats, [
      { playerId: "a", tableNumber: 2 },
      { playerId: "b", tableNumber: 1 },
      { playerId: "c", tableNumber: 3 },
    ]);
  });

  it("sans remise à zéro, garde les sièges existants et ne place que les nouveaux", () => {
    const { seats, changed } = planPuzzleSeats({
      players: [player("a"), player("b"), player("c")],
      existing: [
        { playerId: "a", tableNumber: 5 },
        { playerId: "b", tableNumber: 1 },
      ],
      reset: false,
    });

    assert.deepEqual(seats, [
      { playerId: "a", tableNumber: 5 },
      { playerId: "b", tableNumber: 1 },
      { playerId: "c", tableNumber: 2 },
    ]);
    // Seul le nouveau venu est à prévenir.
    assert.deepEqual(changed, [{ playerId: "c", tableNumber: 2 }]);
  });

  it("avec remise à zéro, redistribue tout et ne signale que ce qui change", () => {
    const { seats, changed } = planPuzzleSeats({
      players: [player("a"), player("b")],
      existing: [
        { playerId: "a", tableNumber: 1 },
        { playerId: "b", tableNumber: 7 },
      ],
      reset: true,
    });

    assert.deepEqual(seats, [
      { playerId: "a", tableNumber: 1 },
      { playerId: "b", tableNumber: 2 },
    ]);
    // a retrouve la même table : rien à lui annoncer.
    assert.deepEqual(changed, [{ playerId: "b", tableNumber: 2 }]);
  });

  it("s'arrête à la dernière table possible", () => {
    const { seats } = planPuzzleSeats({
      players: [player("a"), player("b")],
      existing: [],
      firstTable: 9999,
      reset: false,
    });

    assert.deepEqual(seats, [{ playerId: "a", tableNumber: 9999 }]);
  });
});
