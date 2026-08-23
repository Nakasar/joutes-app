import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isValidModelId, MODEL_ID_MAX_LENGTH } from "./model-id";

/**
 * L'identifiant se tape à la main dans l'administration et part chez un
 * fournisseur : ce qui est refusé ici ne doit pas être une forme légitime, et
 * ce qui passe ne doit pas être n'importe quoi.
 *
 * Exécution : `npm run test`.
 */

describe("isValidModelId", () => {
  it("accepte les formes qu'emploient les fournisseurs", () => {
    for (const id of ["gpt-4o", "gpt-5.6-luna", "openai/gpt-4o", "vendor:model-1_2"]) {
      assert.equal(isValidModelId(id), true, id);
    }
  });

  it("refuse ce qui ne peut pas être un identifiant", () => {
    for (const id of ["", " ", "modèle", "gpt 4o", "-gpt-4o", "/gpt-4o", "gpt;rm -rf"]) {
      assert.equal(isValidModelId(id), false, JSON.stringify(id));
    }
  });

  it("refuse au-delà de la longueur admise", () => {
    assert.equal(isValidModelId("a".repeat(MODEL_ID_MAX_LENGTH)), true);
    assert.equal(isValidModelId("a".repeat(MODEL_ID_MAX_LENGTH + 1)), false);
  });
});
