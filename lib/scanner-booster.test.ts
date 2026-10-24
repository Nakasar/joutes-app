import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createNameMatcher, normalizeCollectorNumber, pickScannedCard, readCollectorNumbers } from "./scanner-booster";

/**
 * Choix de la carte scannée dans un booster : le nom donne les candidates, le
 * numéro de collection départage les variantes d'une même carte.
 *
 * Exécution : `npm run test`.
 */

const base = { id: "OGN202", name: "Jinx, Loose Cannon", collectorNumber: "202" };
const altArt = { id: "OGN202a", name: "Jinx, Loose Cannon", collectorNumber: "202a" };
const signed = { id: "OGN202*", name: "Jinx, Loose Cannon", collectorNumber: "202*" };
const showcase = { id: "OGN307", name: "Jinx, Loose Cannon", collectorNumber: "307" };

describe("normalizeCollectorNumber", () => {
  it("retire les zéros en tête et met en minuscules", () => {
    assert.equal(normalizeCollectorNumber("007A"), "7a");
    assert.equal(normalizeCollectorNumber(" 202* "), "202*");
    assert.equal(normalizeCollectorNumber("0"), "0");
  });
});

describe("readCollectorNumbers", () => {
  it("lit le numéro et ignore le total de l'extension", () => {
    assert.deepEqual(readCollectorNumbers("OGN-202a/298", "OGN"), ["202a"]);
    assert.deepEqual(readCollectorNumbers("OGN 007 / 298", "OGN"), ["7"]);
    assert.deepEqual(readCollectorNumbers("OGN-299*/298", "OGN"), ["299*"]);
  });

  it("ignore les chiffres qui ne sont pas un numéro de collection", () => {
    assert.deepEqual(readCollectorNumbers("5\nDeal 3 damage to a unit.\nMight 4", "OGN"), []);
    assert.deepEqual(readCollectorNumbers("OGN 202 Illus. Someone", "OGN"), ["202"]);
  });

  it("se passe du code de l'extension quand le total suit le numéro", () => {
    assert.deepEqual(readCollectorNumbers("118/298"), ["118"]);
  });

  it("préfère le numéro collé au code de l'extension à un compteur du texte", () => {
    assert.deepEqual(readCollectorNumbers("Gain 12/30 points.\nOGN-307/298", "OGN"), ["307"]);
  });

  it("lit le nombre entier, pas sa fin", () => {
    assert.deepEqual(readCollectorNumbers("12307/298"), []);
    assert.deepEqual(readCollectorNumbers("1307/298"), ["1307"]);
  });
});

describe("pickScannedCard", () => {
  it("prend la seule carte qui porte ce nom, sans numéro", () => {
    assert.equal(pickScannedCard([base], []), base);
  });

  it("ne choisit pas entre variantes sans numéro lisible", () => {
    assert.equal(pickScannedCard([base, altArt], []), null);
  });

  it("départage les variantes par le numéro exact", () => {
    assert.equal(pickScannedCard([base, altArt, signed], ["202a"]), altArt);
    assert.equal(pickScannedCard([base, altArt, signed], ["202"]), base);
    assert.equal(pickScannedCard([base, showcase], ["307"]), showcase);
  });

  it("se contente des chiffres quand ils ne désignent qu'une carte", () => {
    assert.equal(pickScannedCard([altArt, showcase], ["202"]), altArt);
  });

  it("ne tranche pas quand le numéro lu n'appartient à aucune candidate", () => {
    assert.equal(pickScannedCard([base, altArt], ["118"]), null);
  });
});

describe("createNameMatcher", () => {
  const match = createNameMatcher(["Jinx, Loose Cannon", "Teemo, Scout", "Vi, Enforcer", "Unit"]);

  it("reconnaît un nom lu avec du bruit au milieu du texte de la carte", () => {
    assert.equal(match("5\nTeerno, Scout\nWhen you play me, draw 1.")?.name, "Teemo, Scout");
  });

  it("recolle un nom imprimé sur deux lignes", () => {
    assert.equal(match("Jinx,\nLoose Cannon\nAccelerate")?.name, "Jinx, Loose Cannon");
  });

  it("ne prend pas un bout de ligne pour un nom plus long", () => {
    assert.equal(match("Vi\n3"), null);
  });

  it("ne reconnaît rien dans un texte sans nom", () => {
    assert.equal(match("Deal 3 damage to an enemy."), null);
  });
});
