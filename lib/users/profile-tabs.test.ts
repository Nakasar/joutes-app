import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readUserProfileTab, sectionsForTab, visibleProfileTabs } from "./profile-tabs";
import { readUserShowcaseSections } from "./showcase";

/**
 * Les onglets d'une vitrine de profil.
 *
 * Ce que ces cas verrouillent : un onglet dont le bloc est éteint disparaît, un
 * onglet dont le bloc est vide aussi, et une barre qui n'aurait plus que
 * « Vitrine » ne se rend pas du tout.
 *
 * Exécution : `npm run test`.
 */

const allSections = readUserShowcaseSections({ showcase: undefined });

const fullContent = {
  live: true,
  about: true,
  decks: true,
  publications: true,
  achievements: true,
  follows: true,
  trade: true,
};

describe("visibleProfileTabs", () => {
  it("rend tous les onglets quand tout est activé et rempli", () => {
    assert.deepEqual(visibleProfileTabs(allSections, fullContent), [
      "showcase",
      "decks",
      "publications",
      "achievements",
      "trade",
    ]);
  });

  it("retire l'onglet d'un bloc éteint", () => {
    const sections = readUserShowcaseSections({
      showcase: { sections: [{ key: "decks", enabled: false }] },
    });

    assert.ok(!visibleProfileTabs(sections, fullContent).includes("decks"));
  });

  it("retire l'onglet d'un bloc activé mais vide", () => {
    assert.ok(
      !visibleProfileTabs(allSections, { ...fullContent, publications: false }).includes(
        "publications",
      ),
    );
  });

  it("ne rend aucune barre quand il ne resterait que « Vitrine »", () => {
    assert.deepEqual(
      visibleProfileTabs(allSections, {
        decks: false,
        publications: false,
        achievements: false,
        trade: false,
      }),
      [],
    );
  });
});

describe("readUserProfileTab", () => {
  it("retombe sur « Vitrine » pour un onglet qui n'existe plus", () => {
    assert.equal(readUserProfileTab("decks", ["showcase", "trade"]), "showcase");
    assert.equal(readUserProfileTab(undefined, ["showcase", "trade"]), "showcase");
    assert.equal(readUserProfileTab("n'importe quoi", ["showcase"]), "showcase");
  });

  it("garde un onglet demandé qui existe", () => {
    assert.equal(readUserProfileTab("trade", ["showcase", "trade"]), "trade");
  });
});

describe("sectionsForTab", () => {
  it("empile tous les blocs activés sur « Vitrine », dans l'ordre réglé", () => {
    const sections = readUserShowcaseSections({
      showcase: {
        sections: [
          { key: "decks", enabled: true },
          { key: "about", enabled: false },
        ],
      },
    });

    const stacked = sectionsForTab(sections, "showcase");

    // L'ordre est exactement celui que la vitrine a résolu, moins ce qui est
    // éteint : « À propos » a été coupé, « decks » garde sa place devant les
    // blocs qui le suivent par défaut.
    assert.deepEqual(
      stacked,
      sections.filter((section) => section.enabled).map((section) => section.key),
    );
    assert.ok(!stacked.includes("about"));
    assert.ok(stacked.indexOf("decks") < stacked.indexOf("publications"));
  });

  it("n'isole qu'un bloc sur les autres onglets", () => {
    assert.deepEqual(sectionsForTab(allSections, "decks"), ["decks"]);
  });

  it("rend une liste vide quand le bloc de l'onglet est éteint", () => {
    const sections = readUserShowcaseSections({
      showcase: { sections: [{ key: "decks", enabled: false }] },
    });

    assert.deepEqual(sectionsForTab(sections, "decks"), []);
  });
});
