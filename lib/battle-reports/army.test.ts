import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ARMY_UNITS,
  countArmyUnits,
  isEmptyArmy,
  normalizeArmy,
  normalizeArmyUnits,
  normalizeBattleReport,
} from "./army";

/**
 * Tests des listes d'armée d'un rapport de bataille. Ce qui compte ici, c'est
 * qu'une saisie maladroite (deux fois la même figurine, un nom entouré
 * d'espaces, une armée laissée par un joueur retiré) donne un document propre :
 * le rapport est une archive, il est relu longtemps après la partie.
 *
 * Exécution : `npm run test`.
 */

describe("normalizeArmyUnits", () => {
  it("fusionne deux lignes qui citent le même produit", () => {
    const units = normalizeArmyUnits([
      { productId: "vader", name: "Darth Vader", quantity: 1 },
      { productId: "clone", name: "Clone Trooper", quantity: 2 },
      { productId: "vader", name: "Dark Vador", quantity: 1 },
    ]);

    assert.deepEqual(units, [
      { productId: "vader", name: "Darth Vader", quantity: 2 },
      { productId: "clone", name: "Clone Trooper", quantity: 2 },
    ]);
  });

  it("fusionne deux saisies libres du même nom, à la casse et aux espaces près", () => {
    const units = normalizeArmyUnits([
      { name: "Clone Trooper", quantity: 1 },
      { name: "  clone trooper ", quantity: 3 },
    ]);

    assert.deepEqual(units, [{ name: "Clone Trooper", quantity: 4 }]);
  });

  it("conserve l'image du catalogue, qui illustrera le jeton sur la table", () => {
    const units = normalizeArmyUnits([
      { productId: "vader", name: "Darth Vader", image: "https://exemple.test/vader.png", quantity: 1 },
    ]);

    assert.equal(units[0].image, "https://exemple.test/vader.png");
  });

  it("récupère l'image de la ligne illustrée quand deux saisies fusionnent", () => {
    const units = normalizeArmyUnits([
      { productId: "vader", name: "Darth Vader", quantity: 1 },
      { productId: "vader", name: "Darth Vader", image: "https://exemple.test/vader.png", quantity: 1 },
    ]);

    assert.deepEqual(units, [
      {
        productId: "vader",
        name: "Darth Vader",
        image: "https://exemple.test/vader.png",
        quantity: 2,
      },
    ]);
  });

  it("distingue une saisie libre d'un produit du catalogue portant le même nom", () => {
    const units = normalizeArmyUnits([
      { productId: "vader", name: "Darth Vader", quantity: 1 },
      { name: "Darth Vader", quantity: 1 },
    ]);

    assert.equal(units.length, 2);
  });

  it("écarte les lignes sans nom et ramène les quantités dans les bornes", () => {
    const units = normalizeArmyUnits([
      { name: "   ", quantity: 2 },
      { name: "Clone Trooper", quantity: 0 },
      { name: "Vader", quantity: 500 },
    ]);

    assert.deepEqual(units, [
      { name: "Clone Trooper", quantity: 1 },
      { name: "Vader", quantity: 99 },
    ]);
  });

  it("tronque au-delà du plafond, sans perdre les quantités des lignes retenues", () => {
    const units = normalizeArmyUnits([
      ...Array.from({ length: MAX_ARMY_UNITS + 5 }, (_, index) => ({
        name: `Figurine ${index}`,
        quantity: 1,
      })),
      // Arrive après le plafond, mais rejoint une ligne déjà retenue.
      { name: "Figurine 0", quantity: 1 },
    ]);

    assert.equal(units.length, MAX_ARMY_UNITS);
    assert.equal(units[0].quantity, 2);
  });
});

describe("normalizeArmy", () => {
  it("retire le nom vide plutôt que de l'écrire en chaîne vide", () => {
    assert.deepEqual(normalizeArmy({ name: "   ", units: [] }), { units: [] });
  });

  it("conserve le nom débarrassé de ses espaces", () => {
    assert.deepEqual(normalizeArmy({ name: "  Escouade Vador ", units: [] }), {
      name: "Escouade Vador",
      units: [],
    });
  });
});

describe("isEmptyArmy", () => {
  it("est vraie sans nom ni figurine", () => {
    assert.equal(isEmptyArmy({ units: [] }), true);
  });

  it("est fausse dès qu'une liste porte un nom, même sans figurine", () => {
    assert.equal(isEmptyArmy({ name: "Escouade Vador", units: [] }), false);
  });
});

describe("countArmyUnits", () => {
  it("compte les figurines posées, doublons compris", () => {
    const total = countArmyUnits({
      units: [
        { name: "Vader", quantity: 1 },
        { name: "Clone Trooper", quantity: 3 },
      ],
    });

    assert.equal(total, 4);
  });
});

describe("normalizeBattleReport", () => {
  it("abandonne l'armée d'un joueur qui n'est plus dans la partie", () => {
    const report = normalizeBattleReport(
      {
        armies: {
          alice: { units: [{ name: "Vader", quantity: 1 }] },
          bob: { units: [{ name: "Luke", quantity: 1 }] },
        },
      },
      ["alice"]
    );

    assert.deepEqual(Object.keys(report.armies ?? {}), ["alice"]);
  });

  it("écarte les armées vides et les champs libres laissés blancs", () => {
    const report = normalizeBattleReport(
      { scenario: "   ", notes: "\n", armies: { alice: { units: [] } } },
      ["alice"]
    );

    assert.deepEqual(report, {});
  });

  it("conserve un scénario et des notes débarrassés de leurs espaces", () => {
    const report = normalizeBattleReport(
      { scenario: " Prise de position ", notes: " Vador tombe au tour 3. " },
      []
    );

    assert.deepEqual(report, {
      scenario: "Prise de position",
      notes: "Vador tombe au tour 3.",
    });
  });
});
