import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  changeCardQuantity,
  collectionCoverage,
  costCurve,
  countNonCompliantZones,
  deckCardIds,
  deckLegality,
  deckSize,
  isDeckCompliant,
  maxCopies,
  typeSplit,
  zoneCount,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents";
import { getDeckZones, zoneCounterLabel } from "@/lib/decks/zones";

const riftbound = getDeckZones({ slug: "riftbound" });
const generic = getDeckZones({ slug: "autre-jeu" });

const CATALOG: DeckCardInfo[] = [
  { id: "l1", name: "Voix de la Faille", type: "Légende" },
  { id: "c1", name: "Kaelis l'Insoumise", type: "Champion", cost: 4 },
  { id: "m1", name: "Éclat de Faille", type: "Sort", cost: 2 },
  { id: "m2", name: "Marcheur des Dunes", type: "Unité", cost: 1 },
  { id: "m3", name: "Gardien des serments", type: "Unité", cost: 9 },
  { id: "r1", name: "Rune de Fureur", type: "Rune", cost: 0 },
];

const byId = new Map(CATALOG.map((card) => [card.id, card]));

const DECK: DeckCards = {
  legend: [{ cardId: "l1", quantity: 1 }],
  champions: [{ cardId: "c1", quantity: 2 }],
  maindeck: [
    { cardId: "m1", quantity: 3 },
    { cardId: "m2", quantity: 3 },
    { cardId: "m3", quantity: 2 },
  ],
  runes: [{ cardId: "r1", quantity: 12 }],
};

describe("contenu d'un deck", () => {
  it("compte les exemplaires d'une zone", () => {
    assert.equal(zoneCount(DECK, "maindeck"), 8);
    assert.equal(zoneCount(DECK, "sideboard"), 0);
  });

  it("ne compte que les zones déclarées par le jeu", () => {
    // `runes` et `legend` n'existent pas pour un jeu générique : leurs cartes
    // restent en base mais ne gonflent pas la taille annoncée.
    assert.equal(deckSize(DECK, riftbound), 23);
    assert.equal(deckSize(DECK, generic), 8);
  });

  it("liste les identifiants sans doublon", () => {
    assert.deepEqual(deckCardIds(DECK).sort(), ["c1", "l1", "m1", "m2", "m3", "r1"]);
  });

  it("retire la carte dont la quantité tombe à zéro", () => {
    const once = changeCardQuantity(DECK, "champions", "c1", -1);
    assert.deepEqual(once.champions, [{ cardId: "c1", quantity: 1 }]);

    const twice = changeCardQuantity(once, "champions", "c1", -1);
    assert.deepEqual(twice.champions, []);
  });

  it("ajoute une carte absente de la zone", () => {
    const next = changeCardQuantity(DECK, "sideboard", "m1", 1);
    assert.deepEqual(next.sideboard, [{ cardId: "m1", quantity: 1 }]);
    // L'original n'a pas bougé : l'éditeur repose sur un état immuable.
    assert.deepEqual(DECK.sideboard, undefined);
  });

  it("ne descend pas sous zéro en retirant une carte absente", () => {
    const next = changeCardQuantity(DECK, "sideboard", "m1", -1);
    assert.deepEqual(next.sideboard, []);
  });
});

describe("légalité", () => {
  it("juge chaque zone au regard de sa contrainte", () => {
    const rows = deckLegality(DECK, riftbound);
    const byZone = new Map(rows.map((row) => [row.zone.key, row]));

    assert.equal(byZone.get("legend")?.compliant, true, "1 légende exactement");
    assert.equal(byZone.get("champions")?.compliant, true, "2 champions sur 3 au plus");
    assert.equal(byZone.get("maindeck")?.compliant, false, "8 cartes sur 40 minimum");
    assert.equal(byZone.get("runes")?.compliant, true, "12 runes exactement");
    assert.equal(byZone.get("battlefields")?.compliant, false, "aucun battlefield sur 3");
    assert.equal(byZone.get("sideboard")?.compliant, true, "réserve vide sur 10 au plus");
  });

  it("compte les zones à ajuster", () => {
    assert.equal(countNonCompliantZones(DECK, riftbound), 2);
    assert.equal(isDeckCompliant(DECK, riftbound), false);
  });

  it("reconnaît un deck conforme", () => {
    const complete: DeckCards = {
      legend: [{ cardId: "l1", quantity: 1 }],
      champions: [{ cardId: "c1", quantity: 3 }],
      maindeck: [{ cardId: "m1", quantity: 40 }],
      runes: [{ cardId: "r1", quantity: 12 }],
      battlefields: [{ cardId: "m2", quantity: 3 }],
    };

    assert.equal(isDeckCompliant(complete, riftbound), true);
  });

  it("affiche une fraction pour les cibles, un nombre pour les planchers", () => {
    const zones = new Map(riftbound.map((zone) => [zone.key, zone]));
    assert.equal(zoneCounterLabel(zones.get("runes")!, 12), "12 / 12");
    assert.equal(zoneCounterLabel(zones.get("sideboard")!, 4), "4 / 10");
    assert.equal(zoneCounterLabel(zones.get("maindeck")!, 58), "58");
  });
});

describe("statistiques", () => {
  it("ne met dans la courbe que les zones qui comptent", () => {
    const curve = costCurve(DECK, riftbound, byId);

    assert.deepEqual(
      curve.map((bucket) => bucket.count),
      [0, 3, 3, 0, 0, 0, 2]
    );
    // Les runes à coût 0 n'écrasent pas la colonne 0, elles ne sont pas dans la courbe.
    assert.equal(curve[0].count, 0);
    // Le coût 9 se range dans le dernier palier.
    assert.equal(curve.at(-1)?.label, "6+");
  });

  it("mesure les barres par rapport au plus haut pilier", () => {
    const curve = costCurve(DECK, riftbound, byId);
    assert.equal(curve[1].ratio, 1);
    assert.equal(curve[6].ratio, 2 / 3);
  });

  it("répartit par type, du plus représenté au moins représenté", () => {
    assert.deepEqual(typeSplit(DECK, riftbound, byId), [
      { label: "Rune", count: 12 },
      { label: "Unité", count: 5 },
      { label: "Sort", count: 3 },
      { label: "Champion", count: 2 },
      { label: "Légende", count: 1 },
    ]);
  });

  it("ignore les runes et la légende dans le maximum d'exemplaires", () => {
    assert.equal(maxCopies(DECK, riftbound), 3);
  });
});

describe("couverture par la collection", () => {
  it("compte ce qui est couvert et ce qui manque", () => {
    const owned = new Map([
      ["l1", 1],
      ["c1", 1],
      ["m1", 3],
      ["m2", 0],
      ["m3", 5],
      ["r1", 12],
    ]);

    const coverage = collectionCoverage(DECK, riftbound, owned);

    // 1 légende + 1 champion sur 2 + 3 sorts + 0 sur 3 + 2 unités + 12 runes.
    assert.equal(coverage.owned, 19);
    assert.equal(coverage.missing, 4);
    assert.deepEqual(coverage.missingCardIds.sort(), ["c1", "m2"]);
  });

  it("ne réclame pas deux fois la même carte jouée dans deux zones", () => {
    const cards: DeckCards = {
      maindeck: [{ cardId: "m1", quantity: 2 }],
      sideboard: [{ cardId: "m1", quantity: 1 }],
    };

    // Trois exemplaires possédés couvrent bien les deux zones.
    assert.deepEqual(collectionCoverage(cards, riftbound, new Map([["m1", 3]])), {
      owned: 3,
      missing: 0,
      missingCardIds: [],
    });
  });

  it("sans collection connue, tout manque", () => {
    const coverage = collectionCoverage(DECK, riftbound, undefined);

    assert.equal(coverage.owned, 0);
    assert.equal(coverage.missing, 23);
  });
});
