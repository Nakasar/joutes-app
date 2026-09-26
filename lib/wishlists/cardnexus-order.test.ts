import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { copyPriceKey } from "@/lib/prices/copies";
import { wishlistCardnexusOrder, type OrderableWish } from "./cardnexus-order";

/**
 * Commande d'une liste de souhaits sur CardNexus : ce que le lien porte, et ce
 * qu'il laisse.
 *
 * Exécution : `npm run test`.
 */

const productIds = new Map([
  ["OGN-001", 101],
  ["OGN-002", 102],
  ["WNC-141#beta", 120],
]);
const productIdOf = (wish: OrderableWish) => productIds.get(copyPriceKey(wish.cardId, wish.printingId));

describe("wishlistCardnexusOrder", () => {
  it("porte chaque souhait avec sa quantité, et dit combien la liste en compte", () => {
    const order = wishlistCardnexusOrder(
      [
        { cardId: "OGN-001", quantity: 1 },
        { cardId: "OGN-002", quantity: 3 },
      ],
      productIdOf
    );
    assert.equal(order.url?.split("/cn/")[1], "101~102.3");
    assert.deepEqual([order.matched, order.total], [2, 2]);
  });

  it("laisse hors du lien un souhait sans produit, et le compte comme manquant", () => {
    const order = wishlistCardnexusOrder(
      [
        { cardId: "OGN-001", quantity: 1 },
        { cardId: "PROMO-9", quantity: 2 },
      ],
      productIdOf
    );
    assert.equal(order.url?.split("/cn/")[1], "101");
    assert.deepEqual([order.matched, order.total], [1, 2]);
  });

  it("commande le produit de la variante souhaitée, jamais celui d'une autre impression", () => {
    const order = wishlistCardnexusOrder(
      [
        { cardId: "WNC-141", printingId: "beta", quantity: 1 },
        { cardId: "OGN-001", printingId: "showcase", quantity: 1 },
      ],
      productIdOf
    );
    assert.equal(order.url?.split("/cn/")[1], "120");
    assert.deepEqual([order.matched, order.total], [1, 2]);
  });

  it("demande un tirage autre que standard pour un souhait foil", () => {
    const order = wishlistCardnexusOrder([{ cardId: "OGN-001", foil: true, quantity: 2 }], productIdOf);
    assert.equal(order.url?.split("/cn/")[1], "101.2..f");
  });

  it("ne compte pas comme porté un souhait dont l'identifiant de produit n'en est pas un", () => {
    const broken = new Map([
      ["OGN-001", Number.NaN],
      ["OGN-002", -7],
      ["OGN-003", 3.5],
    ]);
    const order = wishlistCardnexusOrder(
      [
        { cardId: "OGN-001", quantity: 1 },
        { cardId: "OGN-002", quantity: 1 },
        { cardId: "OGN-003", quantity: 1 },
      ],
      (wish) => broken.get(wish.cardId)
    );
    assert.equal(order.url, undefined);
    assert.deepEqual([order.matched, order.total], [0, 3]);
  });

  it("ne rend pas de lien quand aucun souhait n'a de produit", () => {
    const order = wishlistCardnexusOrder([{ cardId: "PROMO-9", quantity: 1 }], productIdOf);
    assert.equal(order.url, undefined);
    assert.deepEqual([order.matched, order.total], [0, 1]);
    assert.deepEqual(wishlistCardnexusOrder([], productIdOf), { matched: 0, total: 0 });
  });
});
