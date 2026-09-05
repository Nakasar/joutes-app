import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { earliestInstant, normalizeInstant } from "./instants";

/**
 * La normalisation des dates venues de plusieurs plateformes.
 *
 * Ce que ces cas verrouillent, et c'est tout l'enjeu du module : deux
 * plateformes qui désignent **le même instant** sous deux formes ISO
 * différentes doivent ressortir identiques, faute de quoi le tri lexicographique
 * de MongoDB range la grille dans le désordre sans que rien ne le signale.
 *
 * Exécution : `npm run test`.
 */

describe("normalizeInstant", () => {
  it("ramène un décalage horaire en UTC", () => {
    assert.equal(normalizeInstant("2026-09-04T18:25:36+02:00"), "2026-09-04T16:25:36.000Z");
  });

  it("donne des millisecondes même quand la source n'en a pas", () => {
    assert.equal(normalizeInstant("2026-09-04T18:25:36+00:00"), "2026-09-04T18:25:36.000Z");
    assert.equal(normalizeInstant("2026-09-04T18:25:36Z"), "2026-09-04T18:25:36.000Z");
  });

  it("laisse une forme déjà canonique inchangée", () => {
    assert.equal(normalizeInstant("2026-09-04T18:25:36.591Z"), "2026-09-04T18:25:36.591Z");
  });

  it("rend null pour ce qui n'est pas un instant lisible", () => {
    for (const value of ["", "   ", "hier", "2026-13-45T99:99:99Z", undefined, null]) {
      assert.equal(normalizeInstant(value), null, `attendu null pour ${JSON.stringify(value)}`);
    }
  });

  /*
   * Le cas qui justifie le module entier : une chaîne à décalage se trie sur
   * l'heure écrite, pas sur l'instant. Ici 20 h à Paris, c'est 18 h UTC, donc
   * *avant* 19 h UTC — mais la comparaison brute dit le contraire, et se trompe
   * d'autant d'heures que vaut le décalage.
   */
  it("rend le tri chronologique là où la comparaison brute se trompait", () => {
    const paris = "2026-09-04T20:00:00+02:00"; // 18 h UTC
    const utc = "2026-09-04T19:00:00Z"; // une heure plus tard

    assert.ok(paris > utc, "sans normalisation, l'ordre brut est bien faux");
    assert.ok(normalizeInstant(paris)! < normalizeInstant(utc)!, "après normalisation, il est juste");
  });

  it("rend une forme unique pour un même instant écrit de deux façons", () => {
    // La forme du flux Atom et celle de l'AppView, pour le même instant : deux
    // chaînes différentes, qui ne se comparaient donc pas comme égales.
    assert.notEqual("2026-09-04T18:25:36+00:00", "2026-09-04T18:25:36.000Z");
    assert.equal(
      normalizeInstant("2026-09-04T18:25:36+00:00"),
      normalizeInstant("2026-09-04T18:25:36.000Z"),
    );
  });
});

describe("earliestInstant", () => {
  it("retient l'indexation quand le client s'est daté dans le futur", () => {
    assert.equal(
      earliestInstant("2030-01-01T00:00:00.000Z", "2026-09-04T12:00:00.000Z"),
      "2026-09-04T12:00:00.000Z",
    );
  });

  it("honore une date d'écriture antérieure — un import légitime", () => {
    assert.equal(
      earliestInstant("2024-03-01T09:00:00.000Z", "2026-09-04T12:00:00.000Z"),
      "2024-03-01T09:00:00.000Z",
    );
  });

  it("se contente de celle qui est lisible", () => {
    assert.equal(earliestInstant(undefined, "2026-09-04T12:00:00Z"), "2026-09-04T12:00:00.000Z");
    assert.equal(earliestInstant("2026-09-04T12:00:00Z", "n'importe quoi"), "2026-09-04T12:00:00.000Z");
  });

  it("rend null quand aucune des deux ne se lit", () => {
    assert.equal(earliestInstant(undefined, null), null);
  });

  it("compare les deux après normalisation, et non telles quelles", () => {
    // 18 h UTC contre 19 h UTC écrite avec un décalage : la comparaison brute
    // dirait l'inverse.
    assert.equal(
      earliestInstant("2026-09-04T21:00:00+02:00", "2026-09-04T18:30:00Z"),
      "2026-09-04T18:30:00.000Z",
    );
  });
});
