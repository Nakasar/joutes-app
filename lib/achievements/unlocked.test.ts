import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { unlockedMostRecentFirst } from "./unlocked";

/**
 * L'ordre des succès décrochés.
 *
 * Ce qui vaut d'être verrouillé : un succès non décroché ne doit jamais entrer
 * dans la liste, et une date illisible — Mongo peut en porter, un import par
 * script l'écrivant en chaîne — ne doit pas emporter le tri des autres.
 *
 * Exécution : `npm run test`.
 */

function succes(overrides: Partial<AchievementWithUnlockInfo> = {}): AchievementWithUnlockInfo {
  return {
    id: "a1",
    name: "Adepte de jeu",
    description: "",
    points: 1,
    ...overrides,
  };
}

describe("unlockedMostRecentFirst", () => {
  it("ne retient rien sans succès", () => {
    assert.deepEqual(unlockedMostRecentFirst([]), []);
  });

  it("écarte les succès non décrochés", () => {
    const decroche = succes({ id: "decroche", unlockedAt: new Date("2026-01-01") });
    const aFaire = succes({ id: "a-faire" });

    assert.deepEqual(
      unlockedMostRecentFirst([aFaire, decroche]).map((achievement) => achievement.id),
      ["decroche"],
    );
  });

  it("range le plus récemment décroché en tête", () => {
    const ancien = succes({ id: "ancien", unlockedAt: new Date("2026-01-01") });
    const recent = succes({ id: "recent", unlockedAt: new Date("2026-08-01") });
    const milieu = succes({ id: "milieu", unlockedAt: new Date("2026-04-01") });

    assert.deepEqual(
      unlockedMostRecentFirst([ancien, recent, milieu]).map((achievement) => achievement.id),
      ["recent", "milieu", "ancien"],
    );
  });

  it("ne laisse pas une date illisible désordonner le reste", () => {
    // Ce que Mongo peut rendre quand un import a écrit la date en chaîne : le
    // type dit `Date`, la valeur n'en est pas une.
    const illisible = succes({
      id: "illisible",
      unlockedAt: "pas une date" as unknown as Date,
    });
    const ancien = succes({ id: "ancien", unlockedAt: new Date("2026-01-01") });
    const recent = succes({ id: "recent", unlockedAt: new Date("2026-08-01") });

    assert.deepEqual(
      unlockedMostRecentFirst([ancien, illisible, recent]).map((achievement) => achievement.id),
      ["recent", "ancien", "illisible"],
    );
  });

  it("ne modifie pas la liste reçue", () => {
    const ancien = succes({ id: "ancien", unlockedAt: new Date("2026-01-01") });
    const recent = succes({ id: "recent", unlockedAt: new Date("2026-08-01") });
    const catalogue = [ancien, recent];

    unlockedMostRecentFirst(catalogue);

    assert.deepEqual(
      catalogue.map((achievement) => achievement.id),
      ["ancien", "recent"],
    );
  });
});
