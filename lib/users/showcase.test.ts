import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { USER_SHOWCASE_SECTION_KEYS, readUserShowcaseSections } from "./showcase";

/**
 * L'ordre et l'activation des blocs de la vitrine d'un profil.
 *
 * Ce que ces cas verrouillent : un bloc ajouté après le dernier enregistrement
 * d'un compte réapparaît chez lui plutôt que de disparaître, « souhaits et
 * ventes » reste affiché quoi qu'on stocke, et rien de ce qui sort d'ici ne
 * peut contenir deux fois la même clé.
 *
 * Exécution : `npm run test`.
 */

describe("readUserShowcaseSections", () => {
  it("rend tous les blocs, dans l'ordre par défaut, sans réglage", () => {
    const sections = readUserShowcaseSections({ showcase: undefined });

    assert.deepEqual(
      sections.map((section) => section.key),
      [...USER_SHOWCASE_SECTION_KEYS],
    );
    assert.ok(sections.every((section) => section.enabled));
  });

  it("respecte l'ordre stocké", () => {
    const sections = readUserShowcaseSections({
      showcase: {
        sections: [
          { key: "decks", enabled: true },
          { key: "live", enabled: false },
        ],
      },
    });

    // « decks » a été mis en tête, « live » éteint : les deux sont respectés.
    // Les blocs jamais ordonnés se glissent chacun après le dernier de leurs
    // prédécesseurs déjà placés, sans passer au-dessus de ce qui a été choisi.
    assert.equal(sections[0].key, "decks");
    assert.deepEqual(
      sections.map((section) => section.key),
      ["decks", "publications", "achievements", "follows", "trade", "live", "about"],
    );
    assert.equal(sections.find((section) => section.key === "live")?.enabled, false);
  });

  it("réinsère un bloc absent à sa place par défaut, non à la fin", () => {
    // Le compte a enregistré son ordre avant que « publications » n'existe.
    // Elle doit revenir entre « decks » et « achievements ».
    const sections = readUserShowcaseSections({
      showcase: {
        sections: [
          { key: "live", enabled: true },
          { key: "about", enabled: true },
          { key: "decks", enabled: true },
          { key: "achievements", enabled: true },
          { key: "follows", enabled: true },
          { key: "trade", enabled: true },
        ],
      },
    });

    assert.deepEqual(
      sections.map((section) => section.key),
      ["live", "about", "decks", "publications", "achievements", "follows", "trade"],
    );
  });

  it("complète les blocs absents et n'en rend aucun deux fois", () => {
    const sections = readUserShowcaseSections({
      showcase: { sections: [{ key: "about", enabled: true }] },
    });

    assert.equal(sections.length, USER_SHOWCASE_SECTION_KEYS.length);
    assert.equal(
      new Set(sections.map((section) => section.key)).size,
      USER_SHOWCASE_SECTION_KEYS.length,
    );
  });

  it("écarte les clés inconnues et les doublons", () => {
    const sections = readUserShowcaseSections({
      showcase: {
        sections: [
          // @ts-expect-error — une clé retirée du code, encore en base.
          { key: "podcast", enabled: false },
          { key: "about", enabled: false },
          { key: "about", enabled: true },
        ],
      },
    });

    assert.equal(sections.length, USER_SHOWCASE_SECTION_KEYS.length);
    assert.ok(!sections.some((section) => (section.key as string) === "podcast"));
    // Le premier des deux « about » fait foi.
    assert.equal(sections.find((section) => section.key === "about")?.enabled, false);
  });

  it("garde « souhaits et ventes » allumé même si la base dit le contraire", () => {
    const sections = readUserShowcaseSections({
      showcase: { sections: [{ key: "trade", enabled: false }] },
    });

    const trade = sections.find((section) => section.key === "trade");
    assert.equal(trade?.enabled, true);
    assert.equal(trade?.locked, true);
  });
});
