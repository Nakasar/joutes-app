import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchWishesToOffers } from "./trade-matches.ts";

describe("matchWishesToOffers", () => {
  it("rapproche un souhait d'une mise en vente d'un autre membre", () => {
    const matches = matchWishesToOffers(
      [{ cardId: "c1", name: "Le Corbeau", gameName: "Riftbound", addedByUserId: "sam" }],
      [{ cardId: "c1", addedByUserId: "yann", price: 12, currency: "EUR" }],
    );

    assert.equal(matches.length, 1);
    assert.equal(matches[0].seekerId, "sam");
    assert.equal(matches[0].holderId, "yann");
    assert.equal(matches[0].price, 12);
  });

  it("ignore une carte que le chercheur vend lui-même", () => {
    const matches = matchWishesToOffers(
      [{ cardId: "c1", name: "Le Corbeau", addedByUserId: "sam" }],
      [{ cardId: "c1", addedByUserId: "sam" }],
    );

    assert.deepEqual(matches, []);
  });

  it("ignore les entrées sans auteur, des deux côtés", () => {
    assert.deepEqual(
      matchWishesToOffers([{ cardId: "c1", name: "Le Corbeau" }], [{ cardId: "c1", addedByUserId: "yann" }]),
      [],
    );
    assert.deepEqual(
      matchWishesToOffers([{ cardId: "c1", name: "Le Corbeau", addedByUserId: "sam" }], [{ cardId: "c1" }]),
      [],
    );
  });

  it("ne produit qu'un rapprochement par couple, même si la carte est souhaitée deux fois", () => {
    const matches = matchWishesToOffers(
      [
        { cardId: "c1", name: "Le Corbeau", addedByUserId: "sam" },
        { cardId: "c1", name: "Le Corbeau", addedByUserId: "sam" },
      ],
      [{ cardId: "c1", addedByUserId: "yann" }],
    );

    assert.equal(matches.length, 1);
  });

  it("rapproche un souhait de chaque vendeur distinct", () => {
    const matches = matchWishesToOffers(
      [{ cardId: "c1", name: "Le Corbeau", addedByUserId: "sam" }],
      [
        { cardId: "c1", addedByUserId: "yann" },
        { cardId: "c1", addedByUserId: "marion" },
      ],
    );

    assert.deepEqual(
      matches.map((match) => match.holderId).sort(),
      ["marion", "yann"],
    );
  });
});
