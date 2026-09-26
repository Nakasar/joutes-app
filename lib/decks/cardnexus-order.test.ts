import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getDeckZones } from "@/lib/decks/zones";
import { deckCardnexusOrder, deckOrderLines } from "./cardnexus-order";

/**
 * Commande d'un deck sur CardNexus : les lignes que le deck donne, et le lien
 * qui les porte.
 *
 * Exécution : `npm run test`.
 */

const zones = getDeckZones(null);

describe("deckOrderLines", () => {
  it("somme les exemplaires d'une carte jouée dans plusieurs zones", () => {
    const lines = deckOrderLines(
      {
        maindeck: [
          { cardId: "A", quantity: 3 },
          { cardId: "B", quantity: 2 },
        ],
        sideboard: [{ cardId: "A", quantity: 1 }],
      },
      zones
    );
    assert.deepEqual(lines, [
      { cardId: "A", quantity: 4 },
      { cardId: "B", quantity: 2 },
    ]);
  });

  it("ignore les zones que le jeu ne déclare pas", () => {
    const lines = deckOrderLines(
      { maindeck: [{ cardId: "A", quantity: 1 }], runes: [{ cardId: "R", quantity: 12 }] },
      zones
    );
    assert.deepEqual(lines, [{ cardId: "A", quantity: 1 }]);
  });

  it("ne donne rien pour un deck vide", () => {
    assert.deepEqual(deckOrderLines(undefined, zones), []);
  });
});

describe("deckCardnexusOrder", () => {
  it("porte les cartes cotées avec leur quantité, et compte les autres comme manquantes", () => {
    const productIds = new Map([["A", 101]]);
    const order = deckCardnexusOrder(
      [
        { cardId: "A", quantity: 4 },
        { cardId: "B", quantity: 2 },
      ],
      (line) => productIds.get(line.cardId)
    );
    assert.equal(order.url?.split("/cn/")[1], "101.4");
    assert.deepEqual([order.matched, order.total], [1, 2]);
  });

  it("ne donne pas de lien quand aucune carte n'est cotée", () => {
    const order = deckCardnexusOrder([{ cardId: "B", quantity: 2 }], () => undefined);
    assert.equal(order.url, undefined);
  });
});
