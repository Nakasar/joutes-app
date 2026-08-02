import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatCardList,
  formatCubeCardList,
  normalizePrintCode,
  parseCardList,
  printCodeOf,
  printCodeSplits,
} from "./card-list";

/**
 * Listes de cartes des paquets de cube : ce qui est exporté doit se réimporter
 * à l'identique, et ce qui vient d'un autre outil (sans code d'impression,
 * avec des titres de section) doit rester lisible.
 *
 * Exécution : `npm run test`.
 */

describe("parseCardList", () => {
  it("lit quantité, nom et code d'impression", () => {
    const { entries, invalidLines } = parseCardList("2x Prowling Cutpurse #OGN001\n1x Yasuo #SFD042");

    assert.deepEqual(entries, [
      { quantity: 2, name: "Prowling Cutpurse", printCode: "OGN001" },
      { quantity: 1, name: "Yasuo", printCode: "SFD042" },
    ]);
    assert.deepEqual(invalidLines, []);
  });

  it("accepte les lignes sans code d'impression", () => {
    const { entries } = parseCardList("3x Prowling Cutpurse");

    assert.deepEqual(entries, [{ quantity: 3, name: "Prowling Cutpurse" }]);
  });

  it("accepte les autres écritures de la quantité", () => {
    const { entries } = parseCardList("2 Alpha\nx3 Beta\nGamma");

    assert.deepEqual(entries, [
      { quantity: 2, name: "Alpha" },
      { quantity: 3, name: "Beta" },
      { quantity: 1, name: "Gamma" },
    ]);
  });

  it("additionne les exemplaires d'une même impression", () => {
    const { entries } = parseCardList("1x Alpha #OGN001\n2x Alpha #OGN001\n1x alpha #ogn001");

    assert.deepEqual(entries, [{ quantity: 4, name: "Alpha", printCode: "OGN001" }]);
  });

  it("distingue deux impressions d'une même carte", () => {
    const { entries } = parseCardList("1x Alpha #OGN001\n1x Alpha #SFD005\n1x Alpha");

    assert.deepEqual(entries, [
      { quantity: 1, name: "Alpha", printCode: "OGN001" },
      { quantity: 1, name: "Alpha", printCode: "SFD005" },
      { quantity: 1, name: "Alpha" },
    ]);
  });

  it("ignore les lignes vides et les commentaires", () => {
    const { entries, invalidLines } = parseCardList("// Paquet 1\n\n1x Alpha\n# Note\n");

    assert.deepEqual(entries, [{ quantity: 1, name: "Alpha" }]);
    assert.deepEqual(invalidLines, []);
  });

  it("garde les noms contenant des chiffres ou un x", () => {
    const { entries } = parseCardList("1x X Marks the Spot\n2x Rank 4 Officer");

    assert.deepEqual(entries, [
      { quantity: 1, name: "X Marks the Spot" },
      { quantity: 2, name: "Rank 4 Officer" },
    ]);
  });

  it("refuse une quantité nulle", () => {
    const { entries, invalidLines } = parseCardList("0x Alpha");

    assert.deepEqual(entries, []);
    assert.deepEqual(invalidLines, ["0x Alpha"]);
  });
});

describe("formatCardList", () => {
  it("regroupe les exemplaires d'une même impression", () => {
    const text = formatCardList([
      { name: "Alpha", setCode: "OGN", collectorNumber: "001" },
      { name: "Beta", setCode: "OGN", collectorNumber: "002" },
      { name: "Alpha", setCode: "OGN", collectorNumber: "001" },
    ]);

    assert.equal(text, "2x Alpha #OGN001\n1x Beta #OGN002");
  });

  it("omet le code d'impression quand la carte n'en porte pas", () => {
    assert.equal(formatCardList([{ name: "Alpha" }]), "1x Alpha");
  });

  it("se relit à l'identique", () => {
    const cards = [
      { name: "Alpha", setCode: "OGN", collectorNumber: "001" },
      { name: "Alpha", setCode: "OGN", collectorNumber: "001" },
      { name: "Beta", setCode: "SFD", collectorNumber: "T01" },
    ];

    assert.deepEqual(parseCardList(formatCardList(cards)).entries, [
      { quantity: 2, name: "Alpha", printCode: "OGN001" },
      { quantity: 1, name: "Beta", printCode: "SFDT01" },
    ]);
  });
});

describe("formatCubeCardList", () => {
  it("annonce chaque paquet par un commentaire ignoré à la relecture", () => {
    const text = formatCubeCardList([
      { label: "Paquet 1", cards: [{ name: "Alpha", setCode: "OGN", collectorNumber: "001" }] },
      { label: "Rares", cards: [{ name: "Beta", setCode: "OGN", collectorNumber: "002" }] },
    ]);

    assert.equal(text, "// Paquet 1\n1x Alpha #OGN001\n\n// Rares\n1x Beta #OGN002");
    assert.deepEqual(parseCardList(text).entries, [
      { quantity: 1, name: "Alpha", printCode: "OGN001" },
      { quantity: 1, name: "Beta", printCode: "OGN002" },
    ]);
  });
});

describe("printCodeOf", () => {
  it("colle extension et numéro", () => {
    assert.equal(printCodeOf({ name: "Alpha", setCode: "OGN", collectorNumber: "001" }), "OGN001");
  });

  it("ne rend rien sans impression", () => {
    assert.equal(printCodeOf({ name: "Alpha" }), undefined);
  });
});

describe("normalizePrintCode", () => {
  it("ignore casse et ponctuation", () => {
    assert.equal(normalizePrintCode("sor-001"), "SOR001");
    assert.equal(normalizePrintCode("SOR001"), "SOR001");
  });
});

describe("printCodeSplits", () => {
  it("propose toutes les coupures extension / numéro", () => {
    assert.deepEqual(printCodeSplits("OGN1"), [
      { setCode: "O", collectorNumber: "GN1" },
      { setCode: "OG", collectorNumber: "N1" },
      { setCode: "OGN", collectorNumber: "1" },
    ]);
  });

  it("coupe aussi les codes déjà ponctués", () => {
    assert.ok(printCodeSplits("SOR-001").some(
      (split) => split.setCode === "SOR" && split.collectorNumber === "001",
    ));
  });

  it("ne coupe pas ce qui ne peut pas l'être", () => {
    assert.deepEqual(printCodeSplits("O"), []);
    assert.deepEqual(printCodeSplits("A".repeat(20)), []);
  });
});
