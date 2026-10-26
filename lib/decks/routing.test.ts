import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import { routeCardToZone, zoneHoldingCard } from "@/lib/decks/routing";
import { getDeckZones } from "@/lib/decks/zones";

const riftbound = getDeckZones({ slug: "riftbound" });
const generic = getDeckZones({ slug: "autre-jeu" });

const legend: DeckCardInfo = { id: "OGN-269", name: "Loose Cannon", type: "Legend" };
const rune: DeckCardInfo = { id: "OGN-007", name: "Fury Rune", type: "Rune" };
const battlefield: DeckCardInfo = { id: "OGN-291", name: "Zaun Warrens", type: "Battlefield" };
const jinx: DeckCardInfo = { id: "OGN-202", name: "Jinx, Rebel", type: "Unit", superType: "Champion" };
const spell: DeckCardInfo = { id: "OGN-008", name: "Get Excited!", type: "Spell" };

describe("rangement automatique", () => {
  it("range chaque type dans sa zone", () => {
    assert.equal(routeCardToZone(legend, riftbound, {}), "legend");
    assert.equal(routeCardToZone(rune, riftbound, {}), "runes");
    assert.equal(routeCardToZone(battlefield, riftbound, {}), "battlefields");
    assert.equal(routeCardToZone(spell, riftbound, {}), "maindeck");
  });

  it("lit aussi les types secondaires, sans casse", () => {
    assert.equal(routeCardToZone({ id: "x", name: "x", type: "Unit", types: ["BATTLEFIELD"] }, riftbound, {}), "battlefields");
  });

  it("fait du premier champion le champion choisi, et des suivants des cartes du deck", () => {
    assert.equal(routeCardToZone(jinx, riftbound, {}), "champions");

    const chosen: DeckCards = { champions: [{ cardId: jinx.id, quantity: 1 }] };
    assert.equal(routeCardToZone(jinx, riftbound, chosen), "maindeck");
    assert.equal(routeCardToZone({ ...jinx, id: "OGN-300" }, riftbound, chosen), "maindeck");
  });

  it("met tout dans la zone principale d'un jeu sans ces zones", () => {
    assert.equal(routeCardToZone(legend, generic, {}), "maindeck");
    assert.equal(routeCardToZone(jinx, generic, {}), "maindeck");
  });

  it("retire d'abord là où le rangement aurait ajouté", () => {
    const cards: DeckCards = {
      champions: [{ cardId: jinx.id, quantity: 1 }],
      maindeck: [{ cardId: jinx.id, quantity: 2 }],
    };
    assert.equal(zoneHoldingCard(jinx, riftbound, cards), "maindeck");
    assert.equal(zoneHoldingCard(jinx, riftbound, { champions: cards.champions }), "champions");
    assert.equal(zoneHoldingCard(spell, riftbound, cards), undefined);
    // Hors de la zone du rangement, c'est la première zone qui la porte.
    assert.equal(
      zoneHoldingCard(spell, riftbound, {
        runes: [{ cardId: spell.id, quantity: 1 }],
        sideboard: [{ cardId: spell.id, quantity: 1 }],
      }),
      "runes"
    );
  });
});
