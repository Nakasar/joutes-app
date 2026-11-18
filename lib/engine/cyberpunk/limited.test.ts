import assert from "node:assert/strict";
import { test } from "node:test";

import type { CpTableCard, CpTableCards } from "./cards.ts";
import {
  addToCpDeck,
  cpCostCurve,
  cpDeckColors,
  cpLimitedRules,
  emptyCpDeck,
  fitCpToPool,
  isLegendTaken,
  isOffColor,
  leftInCpPool,
  removeFromCpDeck,
} from "./limited.ts";

const card = (code: string, patch: Partial<CpTableCard>): CpTableCard => ({
  code,
  def: 0,
  name: code,
  title: code,
  kind: "unit",
  color: "red",
  cost: 2,
  power: 2,
  ram: 1,
  sell: false,
  tags: [],
  playable: true,
  ...patch,
});

const cards: CpTableCards = Object.fromEntries(
  [
    card("V1", { kind: "legend", name: "V, Streetkid", title: "V", cost: null }),
    card("V2", { kind: "legend", name: "V, Nomad", title: "V", cost: null }),
    card("L2", { kind: "legend", title: "Jackie", cost: 5 }),
    card("L3", { kind: "legend", title: "Judy", cost: null }),
    card("L4", { kind: "legend", title: "Panam", cost: null }),
    card("R", { color: "red", cost: 1 }),
    card("G", { color: "green", cost: 3 }),
    card("B", { color: "blue", kind: "program", cost: 9 }),
    card("Y", { color: "yellow", kind: "gear", cost: 4 }),
  ].map((entry) => [entry.code, entry]),
);

test("le scellé de Cyberpunk : six boosters de douze cartes, trente cartes au moins", () => {
  assert.deepEqual(cpLimitedRules(), { boosters: 6, minMain: 30, packSize: 12, picks: 0 });
});

test("une carte va au deck ou parmi les Légendes selon son type, et en ressort", () => {
  let deck = emptyCpDeck();
  deck = addToCpDeck(deck, cards.V1);
  deck = addToCpDeck(deck, cards.R);
  deck = addToCpDeck(deck, cards.R);
  assert.deepEqual(deck, { legends: ["V1"], cards: ["R", "R"] });
  deck = removeFromCpDeck(deck, "R");
  deck = removeFromCpDeck(deck, "V1");
  assert.deepEqual(deck, { legends: [], cards: ["R"] });
  assert.deepEqual(removeFromCpDeck(deck, "G"), deck);
});

test("la réserve restante retire les Légendes et les cartes du deck, un exemplaire à la fois", () => {
  const pool = ["V1", "R", "R", "G"].map((code) => ({ code }));
  const left = leftInCpPool(pool, { legends: ["V1"], cards: ["R"] });
  assert.deepEqual(
    left.map((entry) => entry.code),
    ["R", "G"],
  );
  // Une sauvegarde abîmée : ce que la réserve n'a pas est retiré.
  assert.deepEqual(fitCpToPool({ legends: ["V1", "L2"], cards: ["R", "R", "R", "B"] }, pool), {
    legends: ["V1"],
    cards: ["R", "R"],
  });
});

test("une quatrième couleur est signalée, pas une troisième", () => {
  const two = { legends: [], cards: ["R", "G"] };
  assert.deepEqual(cpDeckColors(two, cards), ["red", "green"]);
  assert.equal(isOffColor(cards.B, cpDeckColors(two, cards)), false);
  const three = { legends: [], cards: ["R", "G", "B"] };
  assert.equal(isOffColor(cards.Y, cpDeckColors(three, cards)), true);
  assert.equal(isOffColor(cards.R, cpDeckColors(three, cards)), false);
  // La couleur d'une Légende ne compte pas.
  assert.equal(isOffColor(cards.V1, cpDeckColors(three, cards)), false);
});

test("pas deux Légendes du même nom, ni plus de trois", () => {
  assert.equal(isLegendTaken(cards.V2, { legends: ["V1"], cards: [] }, cards), true);
  assert.equal(isLegendTaken(cards.L2, { legends: ["V1"], cards: [] }, cards), false);
  assert.equal(isLegendTaken(cards.L4, { legends: ["V1", "L2", "L3"], cards: [] }, cards), true);
  assert.equal(isLegendTaken(cards.R, { legends: ["V1", "L2", "L3"], cards: [] }, cards), false);
});

test("la courbe range les coûts en huit colonnes", () => {
  assert.deepEqual(cpCostCurve({ legends: ["L2"], cards: ["R", "R", "G", "B", "Y"] }, cards), [0, 2, 0, 1, 1, 0, 0, 1]);
});
