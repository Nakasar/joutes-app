import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { savedPosterSchema } from "./saved-poster.schema.ts";

const VALID = {
  name: "Mes boutiques du jeudi",
  lairIds: ["652f1a2b3c4d5e6f70819200"],
  gameIds: ["riftbound"],
  period: "week" as const,
  style: "joutes" as const,
  showAttendance: true,
  gameLogos: true,
};

describe("savedPosterSchema", () => {
  it("accepte une affiche complète, le nom rogné", () => {
    const result = savedPosterSchema.safeParse({ ...VALID, name: "  Mes boutiques  " });

    assert.equal(result.success, true);
    assert.equal(result.data?.name, "Mes boutiques");
  });

  it("refuse une affiche sans nom ou sans lieu", () => {
    assert.equal(savedPosterSchema.safeParse({ ...VALID, name: "   " }).success, false);
    assert.equal(savedPosterSchema.safeParse({ ...VALID, lairIds: [] }).success, false);
  });

  it("refuse un identifiant de lieu qui n'en est pas un", () => {
    // La page d'affiche écarte ces identifiants à la lecture : les enregistrer
    // ferait une affiche que la base porte et qu'aucune adresse ne sait rendre.
    for (const id of ["bonjour", "652f1a2b3c4d5e6f7081920", "../../etc", ""]) {
      assert.equal(savedPosterSchema.safeParse({ ...VALID, lairIds: [id] }).success, false, id);
    }
  });

  it("refuse plus de lieux qu'une affiche n'en accepte", () => {
    const many = Array.from({ length: 9 }, (_, index) => `652f1a2b3c4d5e6f7081920${index}`);

    assert.equal(savedPosterSchema.safeParse({ ...VALID, lairIds: many }).success, false);
  });

  it("refuse une période ou un style inconnus", () => {
    assert.equal(savedPosterSchema.safeParse({ ...VALID, period: "année" }).success, false);
    assert.equal(savedPosterSchema.safeParse({ ...VALID, style: "néon" }).success, false);
  });

  it("accepte une affiche sans jeu coché : c'est « tous les jeux »", () => {
    const result = savedPosterSchema.safeParse({ ...VALID, gameIds: [] });

    assert.equal(result.success, true);
    assert.deepEqual(result.data?.gameIds, []);
  });
});
