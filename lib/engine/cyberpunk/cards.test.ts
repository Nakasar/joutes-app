import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { autoLegends, splitCpText, toCpCode, type CpTableCard, type CpTableCards, type LegendInfo } from "./cards.ts";
import { toCpDeck } from "./deck.ts";
import type { CpKind } from "./types.ts";

const KINDS: Record<string, CpKind> = { "WNC-005a": "legend", "WNC-003": "legend", "EPS-001": "legend", "WNC-021": "unit" };
const kindOf = (code: string) => KINDS[code];
const known = (code: string) => code in KINDS;

describe("toCpCode", () => {
  test("garde un identifiant que le moteur connaît", () => {
    assert.equal(toCpCode("WNC-005a", known), "WNC-005a");
  });
  test("ramène un tirage Beta à son extension", () => {
    assert.equal(toCpCode("WNCB-005a", known), "WNC-005a");
    assert.equal(toCpCode("EPSB-001", known), "EPS-001");
  });
  test("refuse ce que le moteur ne connaît pas", () => {
    assert.equal(toCpCode("BXT-001", known), null);
    assert.equal(toCpCode("WNCB-999", known), null);
  });
});

describe("toCpDeck", () => {
  test("sépare les Légendes du reste, où qu'elles soient rangées", () => {
    const { list, problems } = toCpDeck(
      { maindeck: [{ cardId: "WNC-005a", quantity: 1 }, { cardId: "WNC-021", quantity: 3 }], legend: [{ cardId: "WNCB-003", quantity: 1 }], sideboard: [{ cardId: "EPS-001", quantity: 1 }] },
      kindOf,
    );
    assert.deepEqual(problems, []);
    assert.deepEqual(list, { legends: ["WNC-005a", "WNC-003"], cards: ["WNC-021", "WNC-021", "WNC-021"] });
  });
  test("signale une carte inconnue et l'absence de Légendes", () => {
    const { list, problems } = toCpDeck({ maindeck: [{ cardId: "XYZ-1", quantity: 2 }, { cardId: "WNC-021", quantity: 1 }] }, kindOf);
    assert.equal(list, null);
    assert.deepEqual(problems, ["unknownCard", "noLegends"]);
  });
});

describe("autoLegends", () => {
  const legends: LegendInfo[] = [
    { code: "A1", title: "V", color: "red" },
    { code: "A2", title: "V", color: "red" },
    { code: "B", title: "Jackie", color: "red" },
    { code: "C", title: "Panam", color: "blue" },
    { code: "D", title: "Judy", color: "red" },
  ];
  const first = <T,>(list: T[]) => list[0];
  test("prend deux autres Légendes de noms différents, de la même couleur d'abord", () => {
    assert.deepEqual(autoLegends("A1", legends, first), ["A1", "B", "D"]);
  });
  test("complète avec une autre couleur quand la sienne manque", () => {
    assert.deepEqual(autoLegends("C", legends.slice(2, 4), first), null);
    assert.deepEqual(autoLegends("C", legends, first), ["C", "A1", "B"]);
  });
  test("rend null pour une Légende inconnue", () => {
    assert.equal(autoLegends("Z", legends, first), null);
  });
});

describe("splitCpText", () => {
  const card = (code: string, name: string, title: string): CpTableCard => ({
    code,
    def: 0,
    name,
    title,
    kind: "unit",
    color: "red",
    cost: 1,
    power: 1,
    ram: 1,
    sell: false,
    tags: [],
    playable: true,
  });
  const cards: CpTableCards = {
    "WNC-005a": { ...card("WNC-005a", "V, Streetkid", "V"), kind: "legend" },
    "WNC-021": card("WNC-021", "Valentino Guerrera", "Valentino Guerrera"),
  };
  test("met en valeur les noms entiers seulement", () => {
    assert.deepEqual(splitCpText("V attaque Valentino Guerrera.", ["WNC-005a", "WNC-021"], cards), [
      { text: "V", card: "WNC-005a" },
      { text: " attaque " },
      { text: "Valentino Guerrera", card: "WNC-021" },
      { text: "." },
    ]);
  });
  test("préfère le nom complet au nom seul", () => {
    assert.deepEqual(splitCpText("Jouer V, Streetkid", ["WNC-005a"], cards), [
      { text: "Jouer " },
      { text: "V, Streetkid", card: "WNC-005a" },
    ]);
  });
  test("laisse la phrase telle quelle sans carte citée", () => {
    assert.deepEqual(splitCpText("À vous de jouer.", [], cards), [{ text: "À vous de jouer." }]);
  });
});
