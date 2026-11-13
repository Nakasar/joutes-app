import assert from "node:assert/strict";
import { test } from "node:test";

import { localizeSwuText, toSwuCatalogId, toSwuCode, type SwuTableCard, type SwuTableCards } from "./cards.ts";
import { toSwuDeck } from "./deck.ts";

test("les identifiants passent du catalogue au moteur et retour", () => {
  assert.equal(toSwuCode("SOR-5"), "SOR-005");
  assert.equal(toSwuCode("jtl-123"), "JTL-123");
  assert.equal(toSwuCode("SOR-T01"), "SOR-T01");
  assert.equal(toSwuCode("Luke"), null);
  assert.equal(toSwuCatalogId("SOR-005"), "SOR-5");
  assert.equal(toSwuCatalogId("HMW-271"), "HMW-271");
  assert.equal(toSwuCatalogId("TWI-T02"), "TWI-T02");
});

const card = (code: string, engineName: string, title: string) =>
  ({ code, def: 0, name: title, title, engineName, kind: "unit", cost: 0, power: 0, hp: 0, aspects: [], arena: "ground", playable: true }) satisfies SwuTableCard;

test("les noms du moteur deviennent ceux du catalogue, le plus long d'abord", () => {
  const cards: SwuTableCards = {
    "SOR-010": card("SOR-010", "Darth Vader", "Dark Vador"),
    "SOR-999": card("SOR-999", "Darth Vader's Lightsaber", "Sabre Laser de Dark Vador"),
  };
  assert.deepEqual(localizeSwuText("Kevin joue Darth Vader's Lightsaber sur Darth Vader.", ["SOR-010", "SOR-999"], cards), [
    { text: "Kevin joue " },
    { text: "Sabre Laser de Dark Vador", card: "SOR-999" },
    { text: " sur " },
    { text: "Dark Vador", card: "SOR-010" },
    { text: "." },
  ]);
  assert.deepEqual(localizeSwuText("Round 2.", ["SOR-404"], cards), [{ text: "Round 2." }]);
});

test("un deck Joutes devient une liste du moteur, leader et base reconnus à leur type", () => {
  const kinds: Record<string, "leader" | "base" | "unit"> = { "SOR-005": "leader", "SOR-024": "base", "SOR-049": "unit" };
  const kindOf = (code: string) => kinds[code];
  const outcome = toSwuDeck(
    {
      maindeck: [
        { cardId: "SOR-5", quantity: 1 },
        { cardId: "SOR-24", quantity: 1 },
        { cardId: "SOR-49", quantity: 3 },
      ],
      sideboard: [{ cardId: "SOR-49", quantity: 2 }],
    },
    kindOf,
  );
  assert.deepEqual(outcome, {
    list: { leader: "SOR-005", base: "SOR-024", cards: ["SOR-049", "SOR-049", "SOR-049"] },
    problems: [],
  });
  assert.deepEqual(toSwuDeck({ maindeck: [{ cardId: "SOR-49", quantity: 3 }] }, kindOf), {
    list: null,
    problems: ["noLeader", "noBase"],
  });
  assert.deepEqual(toSwuDeck({ maindeck: [{ cardId: "XXX-1", quantity: 1 }] }, kindOf).problems, [
    "unknownCard",
    "noLeader",
    "noBase",
  ]);
});
