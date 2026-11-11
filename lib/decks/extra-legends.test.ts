import assert from "node:assert/strict";
import { test } from "node:test";

import { wantsExtraLegends, zonesForDeck } from "@/lib/decks/extra-legends";
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

test("Neeko en champion choisi compte aussi, pas en réserve", () => {
  assert.equal(wantsExtraLegends({ champions: [{ cardId: "RAD167", quantity: 1 }] }), true);
  assert.equal(wantsExtraLegends({ sideboard: [{ cardId: "RAD167", quantity: 1 }] }), false);
  assert.equal(wantsExtraLegends({ maindeck: [{ cardId: "RAD1670", quantity: 1 }] }), false);
});
