import assert from "node:assert/strict";
import { test } from "node:test";

import { championKey, startingLegendFirst, wantsExtraLegends, zonesForDeck } from "@/lib/decks/extra-legends";
import { getDeckZones } from "@/lib/decks/zones";

const zones = getDeckZones({ slug: "riftbound" });

test("sans Neeko, les zones du jeu ne bougent pas", () => {
  const cards = { legend: [{ cardId: "OGN247", quantity: 1 }], maindeck: [{ cardId: "OGN001", quantity: 3 }] };
  assert.equal(wantsExtraLegends(cards), false);
  assert.equal(zonesForDeck(zones, cards), zones);
});

test("avec Neeko, la zone Légende attend quatre légendes", () => {
  for (const cardId of ["RAD167", "RAD-167", "RAD167a"]) {
    const cards = { maindeck: [{ cardId, quantity: 1 }] };
    assert.equal(wantsExtraLegends(cards), true, cardId);
    const legend = zonesForDeck(zones, cards).find((zone) => zone.key === "legend");
    assert.equal(legend?.min, 4);
    assert.equal(legend?.max, 4);
    assert.match(legend?.rule ?? "", /4 exactement/);
  }
});

test("Neeko se reconnaît en champion choisi ou au deck principal, pas en réserve", () => {
  assert.equal(wantsExtraLegends({ champions: [{ cardId: "RAD167", quantity: 1 }] }), true);
  assert.equal(wantsExtraLegends({ sideboard: [{ cardId: "RAD167", quantity: 1 }] }), false);
  assert.equal(wantsExtraLegends({ maindeck: [{ cardId: "RAD1670", quantity: 1 }] }), false);
});

const NAMES: Record<string, string> = {
  OGN249: "Volibear, Relentless Storm",
  VEN139: "Akali, Rogue Assassin",
  SFD201: "Renata Glasc, Chem-Baroness",
  RAD145: "Orianna, Lady of Clockwork",
  RAD068: "Orianna, Mechanical Marvel",
  RAD167: "Neeko, Blending In",
};
const keysOf = (cardId: string) => [championKey(NAMES[cardId])];
const legends = (...ids: string[]) => ids.map((cardId) => ({ cardId, quantity: 1 }));

test("la légende de départ est celle du champion choisi, quel que soit l'ordre", () => {
  // Un code Piltover Archive relu range les légendes à sa façon.
  const cards = {
    legend: legends("VEN139", "OGN249", "RAD145", "SFD201"),
    champions: [{ cardId: "RAD068", quantity: 1 }],
    maindeck: [{ cardId: "RAD167", quantity: 1 }],
  };
  const ordered = startingLegendFirst(cards, keysOf);
  assert.deepEqual(
    ordered.legend?.map((entry) => entry.cardId),
    ["RAD145", "VEN139", "OGN249", "SFD201"]
  );
  // Déjà en tête : le contenu n'est pas réécrit.
  assert.equal(startingLegendFirst(ordered, keysOf), ordered);
});

test("sans légende du champion choisi, l'ordre du deck est gardé", () => {
  const cards = {
    legend: legends("VEN139", "OGN249", "SFD201", "RAD145"),
    champions: [{ cardId: "RAD167", quantity: 1 }],
  };
  assert.equal(startingLegendFirst(cards, keysOf), cards);
  const alone = { legend: legends("OGN249"), champions: [{ cardId: "RAD068", quantity: 1 }] };
  assert.equal(startingLegendFirst(alone, keysOf), alone);
});
