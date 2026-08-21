import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LAIR_SECTION_KEYS, isSectionEnabled, readLairSections } from "./sections";

/**
 * L'ordre et l'activation des sections de la vitrine.
 *
 * Ce que ces cas verrouillent : une section ajoutée après la dernière
 * sauvegarde d'un lieu réapparaît chez lui plutôt que de disparaître, le
 * calendrier reste affiché quoi qu'on stocke, et rien de ce qui sort d'ici ne
 * peut contenir deux fois la même clé.
 *
 * Exécution : `npm run test`.
 */

describe("readLairSections", () => {
  it("rend toutes les sections, dans l'ordre par défaut, sans réglage", () => {
    const sections = readLairSections({ options: undefined });

    assert.deepEqual(
      sections.map((section) => section.key),
      [...LAIR_SECTION_KEYS],
    );
    assert.ok(sections.every((section) => section.enabled));
  });

  it("respecte l'ordre stocké", () => {
    const sections = readLairSections({
      options: {
        sections: [
          { key: "about", enabled: true },
          { key: "news", enabled: false },
        ],
      },
    });

    assert.equal(sections[0].key, "about");
    assert.equal(sections[1].key, "news");
    assert.equal(sections[1].enabled, false);
    // Les sections jamais ordonnées suivent, sans s'insérer au-dessus de celle
    // que le lieu a délibérément mise en tête.
    assert.deepEqual(
      sections.map((section) => section.key),
      ["about", "news", "featured", "calendar", "media"],
    );
  });

  it("complète les sections absentes du réglage", () => {
    const sections = readLairSections({
      options: { sections: [{ key: "about", enabled: true }] },
    });

    assert.equal(sections.length, LAIR_SECTION_KEYS.length);
    // Chaque clé connue, exactement une fois.
    assert.equal(new Set(sections.map((section) => section.key)).size, LAIR_SECTION_KEYS.length);
  });

  it("réinsère une section absente à sa place par défaut, non à la fin", () => {
    // Le lieu a enregistré son ordre avant que « featured » n'existe. Elle doit
    // revenir entre « news » et « calendar », comme dans l'ordre par défaut —
    // la reléguer en bas de page la ferait passer après le calendrier chez
    // tous les lieux ayant déjà réordonné.
    const sections = readLairSections({
      options: {
        sections: [
          { key: "news", enabled: true },
          { key: "calendar", enabled: true },
          { key: "about", enabled: true },
        ],
      },
    });

    assert.deepEqual(
      sections.map((section) => section.key),
      ["news", "featured", "calendar", "media", "about"],
    );
  });

  it("garde le calendrier affiché même si le réglage l'éteint", () => {
    const sections = readLairSections({
      options: { sections: [{ key: "calendar", enabled: false }] },
    });

    const calendar = sections.find((section) => section.key === "calendar");
    assert.equal(calendar?.enabled, true);
    assert.equal(calendar?.locked, true);
  });

  it("écarte les clés inconnues et les doublons", () => {
    const sections = readLairSections({
      options: {
        sections: [
          { key: "news", enabled: false },
          { key: "news", enabled: true },
          // @ts-expect-error — une clé retirée d'une version précédente.
          { key: "sponsors", enabled: true },
        ],
      },
    });

    assert.equal(sections.length, LAIR_SECTION_KEYS.length);
    assert.equal(sections.filter((section) => section.key === "news").length, 1);
    // La première occurrence gagne : c'est celle qui porte la position.
    assert.equal(isSectionEnabled(sections, "news"), false);
  });
});

describe("isSectionEnabled", () => {
  it("retombe sur « affichée » pour une section absente de la liste", () => {
    assert.equal(isSectionEnabled([], "about"), true);
  });
});
