import { test } from "node:test";
import assert from "node:assert/strict";

import { toEngineDeck } from "./deck.ts";

test("un deck Joutes devient une liste du moteur", () => {
  const { list, problems } = toEngineDeck({
    legend: [{ cardId: "OGN249", quantity: 1 }],
    champions: [{ cardId: "OGN030a", quantity: 1 }],
    maindeck: [
      { cardId: "OGN001", quantity: 3 },
      { cardId: "OGN003", quantity: 2 },
    ],
    runes: [{ cardId: "OGN007", quantity: 12 }],
    battlefields: [
      { cardId: "OGN289", quantity: 1 },
      { cardId: "OGN282", quantity: 1 },
    ],
    sideboard: [{ cardId: "OGN029", quantity: 2 }],
  });

  assert.deepEqual(problems, []);
  assert.equal(list?.legend, "OGN-249");
  assert.equal(list?.champion, "OGN-030");
  assert.deepEqual(list?.main, ["OGN-001", "OGN-001", "OGN-001", "OGN-003", "OGN-003"]);
  assert.equal(list?.runes.length, 12);
  assert.deepEqual(list?.battlefields, ["OGN-289", "OGN-282"]);
});

test("des champions en plus du champion choisi rejoignent le deck principal", () => {
  const { list } = toEngineDeck({
    legend: [{ cardId: "OGN249", quantity: 1 }],
    champions: [
      { cardId: "OGN030", quantity: 1 },
      { cardId: "OGN031", quantity: 2 },
    ],
    maindeck: [{ cardId: "OGN001", quantity: 1 }],
  });

  assert.equal(list?.champion, "OGN-030");
  assert.deepEqual(list?.main, ["OGN-031", "OGN-031", "OGN-001"]);
});

test("sans légende ou sans champion, pas de liste", () => {
  const empty = toEngineDeck(undefined);
  assert.equal(empty.list, null);
  assert.deepEqual(empty.problems, [{ kind: "noLegend" }, { kind: "noChampion" }]);

  const noChampion = toEngineDeck({ legend: [{ cardId: "OGN249", quantity: 1 }] });
  assert.equal(noChampion.list, null);
  assert.deepEqual(noChampion.problems, [{ kind: "noChampion" }]);
});

test("une carte sans numéro est signalée et écartée", () => {
  const { list, problems } = toEngineDeck({
    legend: [{ cardId: "OGN249", quantity: 1 }],
    champions: [{ cardId: "OGN030", quantity: 1 }],
    maindeck: [{ cardId: "jeton-recrue", quantity: 1 }],
  });

  assert.deepEqual(problems, [{ kind: "unknownCard", cardId: "jeton-recrue" }]);
  assert.deepEqual(list?.main, []);
});

test("les légendes rangées après la première sont celles de Neeko", () => {
  const plain = toEngineDeck({
    legend: [{ cardId: "OGN249", quantity: 1 }],
    champions: [{ cardId: "OGN030", quantity: 1 }],
  });
  assert.equal(plain.list?.extra_legends, undefined);

  const { list } = toEngineDeck({
    legend: [
      { cardId: "OGN249", quantity: 1 },
      { cardId: "VEN139", quantity: 1 },
      { cardId: "SFD201", quantity: 1 },
      { cardId: "RAD145", quantity: 1 },
    ],
    champions: [{ cardId: "OGN030", quantity: 1 }],
    maindeck: [{ cardId: "RAD167", quantity: 1 }],
  });
  assert.equal(list?.legend, "OGN-249");
  assert.deepEqual(list?.extra_legends, ["VEN-139", "SFD-201", "RAD-145"]);
});
