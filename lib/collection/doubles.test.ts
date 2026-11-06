import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectionDoubles } from "@/lib/collection/doubles";
import type { CollectionEntryGroup } from "@/lib/collection/formats/types";

/** Exécution : `npm run test`. */

function group(overrides: Partial<CollectionEntryGroup>): CollectionEntryGroup {
  return { cardId: "OGN001", name: "Blazing Scorcher", setCode: "OGN", collectorNumber: "001", foil: false, quantity: 1, ...overrides };
}

describe("doubles de la collection", () => {
  it("ne garde que ce qui dépasse le nombre gardé par carte", () => {
    const doubles = collectionDoubles([group({ quantity: 5 }), group({ cardId: "OGN002", quantity: 2 })], 3);
    assert.deepEqual(doubles.map((entry) => [entry.cardId, entry.quantity]), [["OGN001", 2]]);
  });

  it("garde d'abord les exemplaires ordinaires, et propose les foil en double", () => {
    const doubles = collectionDoubles([group({ foil: true, quantity: 1 }), group({ quantity: 3 })], 3);
    assert.deepEqual(doubles.map((entry) => [entry.foil, entry.quantity]), [[true, 1]]);
  });

  it("garde l'ordre du fichier", () => {
    const doubles = collectionDoubles(
      [group({ cardId: "A", quantity: 4 }), group({ cardId: "B", quantity: 4 }), group({ cardId: "A", foil: true, quantity: 1 })],
      3
    );
    assert.deepEqual(doubles.map((entry) => [entry.cardId, entry.foil]), [["A", false], ["B", false], ["A", true]]);
  });
});
