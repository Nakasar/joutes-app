import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBoosterTypeLabels,
  getBoosterTypeOptions,
  getBoosterTypes,
  isBoosterType,
} from "./booster-types";
import { gameBoosterTypesSchema } from "@/lib/schemas/game.schema";

/**
 * Types de boosters d'un jeu : la liste réglée depuis l'administration
 * remplace celle livrée avec la plateforme, et « Autre » reste toujours
 * proposé en dernier.
 *
 * Exécution : `npm run test`.
 */
describe("getBoosterTypes", () => {
  it("suit la liste livrée tant que le jeu n'en porte pas", () => {
    assert.deepEqual(getBoosterTypes({ slug: "riftbound" }), ["pre-rift", "booster", "other"]);
    assert.deepEqual(getBoosterTypes({ slug: "inconnu" }), ["other"]);
    assert.deepEqual(getBoosterTypes(undefined), ["other"]);
  });

  it("prend la liste du jeu quand l'administration l'a réglée", () => {
    const game = { slug: "riftbound", boosterTypes: [{ key: "jumbo", label: "Jumbo" }, { key: "booster" }] };
    assert.deepEqual(getBoosterTypes(game), ["jumbo", "booster", "other"]);
    assert.equal(isBoosterType(game, "pre-rift"), false);
    assert.equal(isBoosterType(game, "jumbo"), true);
  });

  it("garde « Autre » seul pour une liste vide, et ne le double jamais", () => {
    assert.deepEqual(getBoosterTypes({ slug: "riftbound", boosterTypes: [] }), ["other"]);
    assert.deepEqual(getBoosterTypes({ boosterTypes: [{ key: "other" }, { key: "custom" }] }), ["other"]);
  });
});

describe("getBoosterTypeLabels", () => {
  it("ne rend que les libellés saisis", () => {
    const game = { boosterTypes: [{ key: "jumbo", label: "Jumbo" }, { key: "booster" }] };
    assert.deepEqual(getBoosterTypeLabels(game), { jumbo: "Jumbo" });
  });
});

describe("getBoosterTypeOptions", () => {
  it("garde en tête une valeur courante retirée de la liste", () => {
    assert.deepEqual(getBoosterTypeOptions(["booster", "other"], "jumbo"), ["jumbo", "booster", "other"]);
    assert.deepEqual(getBoosterTypeOptions(["booster", "other"], "custom"), ["booster", "other"]);
  });
});

describe("gameBoosterTypesSchema", () => {
  it("accepte des clés en tirets et vide les libellés blancs", () => {
    assert.deepEqual(gameBoosterTypesSchema.parse([{ key: "set-booster", label: "  " }]), [
      { key: "set-booster", label: undefined },
    ]);
  });

  it("refuse les clés réservées, mal formées ou en double", () => {
    assert.equal(gameBoosterTypesSchema.safeParse([{ key: "other" }]).success, false);
    assert.equal(gameBoosterTypesSchema.safeParse([{ key: "Set Booster" }]).success, false);
    assert.equal(gameBoosterTypesSchema.safeParse([{ key: "a" }, { key: "a" }]).success, false);
  });
});
