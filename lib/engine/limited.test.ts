import assert from "node:assert/strict";
import { test } from "node:test";

import type { TableCard, TableCards } from "./cards.ts";
import {
  addToDeck,
  BLANK_BATTLEFIELD,
  chooseChampion,
  chosenDomains,
  costCurve,
  drawPacks,
  emptyDeck,
  fitsDomains,
  fitToPool,
  leftInPool,
  matchOf,
  matchWinner,
  removeFromMain,
  runesFrom,
  splitRunes,
  stacks,
  type LimitedView,
} from "./limited.ts";

const card = (code: string, kind: TableCard["kind"], domains: string[], more: Partial<TableCard> = {}): TableCard => ({
  code,
  name: code,
  kind,
  energy: 2,
  power: 0,
  domains,
  playable: true,
  ...more,
});

const cards: TableCards = Object.fromEntries(
  [
    card("U-FURY", "unit", ["fury"], { energy: 1, rarity: "common" }),
    card("U-CALM", "unit", ["calm"], { energy: 3, rarity: "rare" }),
    card("U-MIND", "spell", ["mind"], { energy: 9, power: 2, rarity: "epic" }),
    card("U-BODY", "gear", ["body"]),
    card("CHAMP", "unit", ["fury"], { champion: true, energy: 5 }),
    card("LEG", "legend", ["fury", "calm"]),
    card("BF", "battlefield", []),
    card("R-FURY", "rune", ["fury"], { def: 1 }),
    card("R-FURY-ALT", "rune", ["fury"], { def: 50 }),
    card("R-CALM", "rune", ["calm"], { def: 2 }),
    card("R-MIND", "rune", ["mind"], { def: 3 }),
  ].map((entry) => [entry.code, entry]),
);

test("une carte va à la place que son type lui donne", () => {
  let deck = emptyDeck();
  deck = addToDeck(deck, cards["LEG"]);
  deck = addToDeck(deck, cards["U-FURY"]);
  deck = addToDeck(deck, cards["BF"]);
  deck = addToDeck(deck, cards["R-FURY"]);
  assert.equal(deck.legend, "LEG");
  assert.deepEqual(deck.main, ["U-FURY"]);
  assert.deepEqual(deck.battlefields, ["BF", BLANK_BATTLEFIELD, BLANK_BATTLEFIELD]);
  assert.deepEqual(deck.runes, []);
});

test("le champion choisi sort du deck principal et y retourne", () => {
  const deck = { ...emptyDeck(), main: ["CHAMP", "U-FURY", "CHAMP"] };
  const chosen = chooseChampion(deck, "CHAMP");
  assert.equal(chosen.champion, "CHAMP");
  assert.deepEqual(chosen.main, ["U-FURY", "CHAMP"]);
  assert.deepEqual(chooseChampion(chosen, "").main.sort(), ["CHAMP", "CHAMP", "U-FURY"]);
  // Retirer un exemplaire touche d'abord le deck principal.
  assert.equal(removeFromMain(chosen, "CHAMP").champion, "CHAMP");
  assert.equal(removeFromMain({ ...chosen, main: ["U-FURY"] }, "CHAMP").champion, "");
});

test("la réserve restante ne compte pas les cartes prises par le deck", () => {
  const pool = [{ code: "U-FURY" }, { code: "U-FURY", foil: true }, { code: "LEG" }, { code: "BF" }];
  const deck = { ...emptyDeck(), legend: "LEG", main: ["U-FURY"] };
  // La brillante reste dans la réserve.
  assert.deepEqual(leftInPool(pool, deck), [{ code: "U-FURY", foil: true }, { code: "BF" }]);
  assert.deepEqual(
    stacks([...pool, { code: "BF" }]).map((stack) => [stack.code, stack.count, stack.foil]),
    [
      ["U-FURY", 2, true],
      ["LEG", 1, false],
      ["BF", 2, false],
    ],
  );
});

test("un deck gardé perd les cartes que la réserve n'a pas", () => {
  const deck = {
    ...emptyDeck(),
    legend: "LEG",
    champion: "CHAMP",
    main: ["U-FURY", "U-FURY", "U-CALM"],
    battlefields: ["BF", "BF", BLANK_BATTLEFIELD],
  };
  const fitted = fitToPool(deck, [{ code: "U-FURY" }, { code: "BF" }, { code: "LEG" }]);
  assert.equal(fitted.legend, "LEG");
  assert.equal(fitted.champion, "");
  assert.deepEqual(fitted.main, ["U-FURY"]);
  assert.deepEqual(fitted.battlefields, ["BF", BLANK_BATTLEFIELD, BLANK_BATTLEFIELD]);
});

test("l'identité compte la Légende, et une carte d'un quatrième domaine n'entre pas", () => {
  const deck = { ...emptyDeck(), legend: "LEG", main: ["U-MIND"] };
  assert.deepEqual(chosenDomains(deck, cards), ["fury", "calm", "mind"]);
  assert.equal(fitsDomains(cards["U-BODY"], chosenDomains(deck, cards)), false);
  assert.equal(fitsDomains(cards["U-FURY"], chosenDomains(deck, cards)), true);
});

test("la courbe range les coûts de 7 et plus dans la dernière colonne", () => {
  assert.deepEqual(costCurve(["U-FURY", "U-CALM", "U-MIND", "CHAMP"], cards), [0, 1, 0, 1, 0, 1, 0, 1]);
});

test("douze runes, au moins une par domaine joué, la rune de base de chaque domaine", () => {
  const deck = { ...emptyDeck(), main: ["U-FURY", "U-FURY", "U-FURY", "U-CALM", "U-MIND"] };
  const counts = splitRunes(deck, cards);
  assert.equal(counts.fury + counts.calm + counts.mind, 12);
  assert.ok(counts.fury > counts.calm && counts.calm >= 1 && counts.mind >= 1);
  const runes = runesFrom(counts, cards);
  assert.equal(runes.length, 12);
  assert.ok(!runes.includes("R-FURY-ALT"));
  assert.deepEqual(splitRunes(emptyDeck(), cards), { fury: 0, calm: 0, mind: 0, body: 0, chaos: 0, order: 0 });
});

test("le vainqueur d'un match est un siège de l'évènement, pas de la table", () => {
  const match = { seats: [3, 0] as [number, number], seed: 1, done: false, winner: null };
  assert.equal(matchWinner(match, [0]), 3);
  assert.equal(matchWinner(match, [1]), 0);
  assert.equal(matchWinner(match, []), null);
  const view = { matches: [{ ...match, seats: [1, 2] }, match] } as unknown as LimitedView;
  assert.equal(matchOf(view, 0)?.index, 1);
  assert.equal(matchOf(view, 5), null);
});

test("le tirage d'une collection ne prend chaque booster qu'une fois", () => {
  const toCode = (cardId: string) => (cardId.startsWith("ZZZ") ? null : cardId.replace("OGN", "OGN-"));
  // WNCB est un tirage rangé à part au catalogue, équivalent moteur de WNC.
  const setOf = (setCode: string) => ({ OGN: "OGN", SFD: "SFD", WNCB: "WNC" })[setCode] ?? null;
  const boosters = [
    { setCode: "OGN", cards: [{ cardId: "OGN001" }, { cardId: "OGN002", foil: true }, { cardId: "ZZZ999" }] },
    { setCode: "WNCB", cards: [{ cardId: "OGN003" }] },
    { setCode: "SFD", cards: [{ cardId: "ZZZ998" }] },
    { setCode: "XXX", cards: [{ cardId: "OGN004" }] },
  ];
  const { packs, sets, ignored, skipped } = drawPacks(toCode, setOf, boosters, 6);
  // Deux boosters seulement sont tirés (au plus `count`), jamais deux fois le même.
  assert.equal(packs.length, 2);
  assert.equal(sets.length, 2);
  assert.deepEqual([...sets].sort(), ["OGN", "WNC"]);
  // Les cartes inconnues du moteur sont comptées, le booster SFD (plus que des
  // inconnues) et le booster XXX (extension sans équivalent) sont écartés.
  assert.equal(ignored, 2);
  assert.equal(skipped, 2);
  const flat = packs.flat().map((card) => card.code).sort();
  assert.deepEqual(flat, ["OGN-001", "OGN-002", "OGN-003"]);
  assert.ok(packs.flat().some((card) => card.foil === true));
  // Chaque tirage est une copie : modifier un booster tiré ne touche pas les autres.
  packs[0][0].code = "MUTATED";
  assert.ok(packs.slice(1).every((pack) => pack.every((card) => card.code !== "MUTATED")));
});

test("un tirage sans aucun booster jouable rend rien", () => {
  assert.deepEqual(drawPacks(() => null, () => "OGN", [{ setCode: "OGN", cards: [{ cardId: "OGN001" }] }], 6), {
    packs: [],
    sets: [],
    ignored: 1,
    skipped: 1,
  });
});
