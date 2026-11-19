import assert from "node:assert/strict";
import { test } from "node:test";

import type { SwuTableCard, SwuTableCards } from "./cards.ts";
import {
  addToSwuDeck,
  emptySwuDeck,
  fitSwuToPool,
  leftInSwuPool,
  removeFromSwuDeck,
  swuAspectPenalty,
  swuBaseChoices,
  swuCostCurve,
  swuDeckAspects,
  swuLimitedRules,
} from "./limited.ts";

const card = (code: string, patch: Partial<SwuTableCard>): SwuTableCard => ({
  code,
  def: 0,
  name: code,
  title: code,
  engineName: code,
  kind: "unit",
  cost: 2,
  power: 2,
  hp: 2,
  aspects: [],
  arena: "ground",
  playable: true,
  ...patch,
});

const cards: SwuTableCards = Object.fromEntries(
  [
    card("SOR-005", { kind: "leader", aspects: ["vigilance", "heroism"], rarity: "special" }),
    card("SOR-020", { kind: "base", aspects: ["vigilance"], rarity: "common" }),
    card("SOR-023", { kind: "base", aspects: ["command"], rarity: "common" }),
    card("SOR-019", { kind: "base", aspects: ["vigilance"], rarity: "rare" }),
    card("SHD-020", { kind: "base", aspects: ["cunning"], rarity: "common" }),
    card("SOR-040", { aspects: ["vigilance"], cost: 1 }),
    card("SOR-041", { aspects: ["vigilance", "vigilance"], cost: 3 }),
    card("SOR-100", { aspects: ["command", "villainy"], cost: 4 }),
    card("SOR-200", { kind: "event", aspects: [], cost: 7 }),
  ].map((entry) => [entry.code, entry]),
);

test("les nombres du format : six boosters de seize cartes, ou trois boosters de quatorze", () => {
  assert.deepEqual(swuLimitedRules("sealed"), { boosters: 6, minMain: 30, packSize: 16, picks: 0 });
  assert.equal(swuLimitedRules("draft").packSize, 14);
});

test("une icône d'aspect que ni le leader ni la base ne donnent coûte deux ressources", () => {
  const deck = { leader: "SOR-005", base: "SOR-020", cards: [] };
  const aspects = swuDeckAspects(deck, cards);
  assert.deepEqual(aspects, ["vigilance", "heroism", "vigilance"]);
  assert.equal(swuAspectPenalty(cards["SOR-040"], aspects), 0);
  assert.equal(swuAspectPenalty(cards["SOR-041"], aspects), 0);
  assert.equal(swuAspectPenalty(cards["SOR-100"], aspects), 4);
  assert.equal(swuAspectPenalty(cards["SOR-200"], aspects), 0);
  // Une seule icône Vigilance en tout : la seconde de la carte manque.
  assert.equal(swuAspectPenalty(cards["SOR-041"], ["vigilance", "heroism"]), 2);
});

test("la courbe compte la pénalité d'aspect", () => {
  const deck = { leader: "SOR-005", base: "SOR-020", cards: ["SOR-040", "SOR-100", "SOR-200"] };
  assert.deepEqual(swuCostCurve(deck, cards), [0, 1, 0, 0, 0, 0, 0, 2]);
});

test("les bases : celles de la réserve, puis les communes de ses extensions", () => {
  const pool = [{ code: "SOR-019" }, { code: "SOR-040" }, { code: "SOR-023" }];
  assert.deepEqual(swuBaseChoices(cards, pool), ["SOR-019", "SOR-023", "SOR-020"]);
});

test("le deck prend dans la réserve, sauf une base commune", () => {
  const pool = [{ code: "SOR-005" }, { code: "SOR-040" }, { code: "SOR-040", foil: true }, { code: "SOR-100" }];
  let deck = emptySwuDeck();
  deck = addToSwuDeck(deck, cards["SOR-005"]);
  deck = addToSwuDeck(deck, cards["SOR-020"]);
  deck = addToSwuDeck(deck, cards["SOR-040"]);
  assert.deepEqual(deck, { leader: "SOR-005", base: "SOR-020", cards: ["SOR-040"] });
  // L'exemplaire brillant reste visible dans la réserve.
  assert.deepEqual(leftInSwuPool(pool, deck), [{ code: "SOR-040", foil: true }, { code: "SOR-100" }]);
  assert.deepEqual(removeFromSwuDeck(deck, "SOR-040").cards, []);

  const damaged = { leader: "SOR-999", base: "SOR-020", cards: ["SOR-040", "SOR-040", "SOR-040", "SOR-200"] };
  assert.deepEqual(fitSwuToPool(damaged, pool), { leader: "", base: "SOR-020", cards: ["SOR-040", "SOR-040"] });
});
