import { test } from "node:test";
import assert from "node:assert/strict";

import { completeEngineDeck, type CompletionCatalog } from "./complete-deck.ts";
import type { EngineDeckList } from "./types.ts";

/** Un catalogue réduit : Jinx (légende OGN-251) a deux champions, OGN-030 et OGN-031 ; OGN-031 hors identité. */
const catalog = (refuse: (list: EngineDeckList) => string[] = () => []): CompletionCatalog => ({
  tagsOf: (code) => (["OGN-251", "OGN-030", "OGN-031"].includes(code) ? ["Jinx"] : []),
  championsOf: (legend) => (legend === "OGN-251" ? ["OGN-030", "OGN-031"] : []),
  battlefieldsFor: () => ["OGN-282", "OGN-289", "OGN-290"],
  validate: refuse,
});

/** Un deck du locator : la légende, 39 cartes de deck principal, les runes, ni champion ni champs de bataille. */
const locator = (main: { cardId: string; quantity: number }[]) => ({
  legend: [{ cardId: "OGN251", quantity: 1 }],
  champions: [],
  maindeck: main,
  runes: [{ cardId: "OGN007", quantity: 12 }],
  battlefields: [],
});

test("un deck du locator reçoit un champion de sa légende et trois champs de bataille", () => {
  const { list, problems, completed } = completeEngineDeck(
    locator([
      { cardId: "OGN001", quantity: 37 },
      { cardId: "OGN031", quantity: 2 },
    ]),
    catalog(),
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(completed, ["battlefields", "champion"]);
  // Le champion dont le deck a déjà des exemplaires passe avant l'ordre du catalogue.
  assert.equal(list?.champion, "OGN-031");
  assert.equal(list?.main.length, 39);
  assert.deepEqual(list?.battlefields, ["OGN-282", "OGN-289", "OGN-290"]);
});

test("un champion déjà à 3 exemplaires n'est pas choisi, ni un champion que le moteur refuse", () => {
  const deck = locator([
    { cardId: "OGN001", quantity: 36 },
    { cardId: "OGN031", quantity: 3 },
  ]);
  assert.equal(completeEngineDeck(deck, catalog()).list?.champion, "OGN-030");

  const refuseThirty = (list: EngineDeckList) => (list.champion === "OGN-030" ? ["hors identité"] : []);
  const other = locator([{ cardId: "OGN001", quantity: 39 }]);
  assert.equal(completeEngineDeck(other, catalog(refuseThirty)).list?.champion, "OGN-031");
});

test("sans champion possible, le deck reste refusé avec la raison du moteur", () => {
  const { list, problems, completed } = completeEngineDeck(
    locator([{ cardId: "OGN001", quantity: 39 }]),
    catalog(() => ["une carte n'est pas prise en charge"]),
  );
  assert.equal(list, null);
  assert.deepEqual(problems, ["une carte n'est pas prise en charge"]);
  assert.deepEqual(completed, []);
});

test("un deck complet passe tel quel", () => {
  const { list, completed } = completeEngineDeck(
    {
      legend: [{ cardId: "OGN251", quantity: 1 }],
      champions: [{ cardId: "OGN030", quantity: 1 }],
      maindeck: [{ cardId: "OGN001", quantity: 39 }],
      runes: [{ cardId: "OGN007", quantity: 12 }],
      battlefields: [{ cardId: "OGN283", quantity: 1 }],
    },
    catalog(),
  );
  assert.deepEqual(completed, []);
  assert.equal(list?.champion, "OGN-030");
  assert.deepEqual(list?.battlefields, ["OGN-283"]);
});

test("sans légende, rien n'est inventé", () => {
  const { list, problems } = completeEngineDeck({ maindeck: [{ cardId: "OGN001", quantity: 40 }] }, catalog());
  assert.equal(list, null);
  assert.deepEqual(problems, ["noLegend", "noChampion"]);
});
