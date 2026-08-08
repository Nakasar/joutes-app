import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accentInsensitivePattern, cardSearchFilter } from "@/lib/collection/search";

/**
 * Tests de la recherche de cartes en collection. Les motifs sont vérifiés en
 * les exécutant sur des noms réels plutôt qu'en comparant des chaînes : c'est
 * le comportement de correspondance qui compte, pas la forme du motif.
 *
 * Exécution : `npm run test`.
 */

/** Applique le motif comme le ferait MongoDB : recherche partielle, sans casse. */
function matches(pattern: string, value: string): boolean {
  return new RegExp(pattern, "i").test(value);
}

/** Clause `name` du filtre, celle qui porte la recherche par nom. */
function namePattern(search: string): string {
  const filter = cardSearchFilter(search) as { $or: { name?: { $regex: string } }[] };
  const clause = filter.$or.find((entry) => entry.name);
  return clause!.name!.$regex;
}

describe("accentInsensitivePattern", () => {
  it("trouve un nom accentué depuis une saisie sans accent", () => {
    assert.ok(matches(accentInsensitivePattern("elise"), "Élise Sanglante"));
  });

  it("trouve un nom sans accent depuis une saisie accentuée", () => {
    assert.ok(matches(accentInsensitivePattern("héros"), "Heros of the Rift"));
  });

  it("ne confond pas deux lettres différentes", () => {
    assert.ok(!matches(accentInsensitivePattern("elise"), "Alise"));
  });

  it("échappe les caractères spéciaux au lieu de les interpréter", () => {
    // Sans échappement, « . » vaudrait « n'importe quel caractère ».
    assert.ok(!matches(accentInsensitivePattern("a.c"), "abc"));
    assert.ok(matches(accentInsensitivePattern("a.c"), "a.c"));
  });

  it("ne casse pas sur une saisie qui ressemble à une expression régulière", () => {
    assert.doesNotThrow(() => new RegExp(accentInsensitivePattern("[a-z](")));
  });
});

describe("cardSearchFilter", () => {
  it("ne filtre rien sur une recherche vide", () => {
    assert.equal(cardSearchFilter(undefined), null);
    assert.equal(cardSearchFilter(""), null);
    assert.equal(cardSearchFilter("   "), null);
  });

  it("cherche le nom n'importe où dans la valeur", () => {
    assert.ok(matches(namePattern("scorch"), "Blazing Scorcher"));
  });

  it("accepte un numéro de collection complété de zéros ou non", () => {
    const filter = cardSearchFilter("12") as { $or: Record<string, { $regex?: string }>[] };
    const numberClause = filter.$or.find((entry) => entry.collectorNumber?.$regex);
    const pattern = numberClause!.collectorNumber!.$regex!;

    assert.ok(matches(pattern, "012"));
    assert.ok(matches(pattern, "12"));
    // Ancré au début : « 12 » ne doit pas ramener la carte 312.
    assert.ok(!matches(pattern, "312"));
  });

  it("ajoute une égalité pour les numéros stockés en nombre", () => {
    const filter = cardSearchFilter("12") as { $or: Record<string, unknown>[] };
    assert.ok(filter.$or.some((entry) => entry.collectorNumber === 12));
  });

  it("n'ajoute pas d'égalité numérique pour une recherche textuelle", () => {
    const filter = cardSearchFilter("annie") as { $or: Record<string, unknown>[] };
    assert.ok(!filter.$or.some((entry) => typeof entry.collectorNumber === "number"));
  });

  it("n'ajoute d'égalité numérique que pour une suite de chiffres", () => {
    // `Number` accepterait ces trois-là et chercherait un numéro que personne
    // n'a saisi : 12000, 1 et -5.
    for (const search of ["12e3", "1.0", "-5"]) {
      const filter = cardSearchFilter(search) as { $or: Record<string, unknown>[] };
      assert.ok(
        !filter.$or.some((entry) => typeof entry.collectorNumber === "number"),
        `« ${search} » ne doit pas produire d'égalité numérique`,
      );
    }
  });

  it("cherche l'identifiant de carte par son début", () => {
    const filter = cardSearchFilter("OGN001") as { $or: Record<string, { $regex?: string }>[] };
    const idClause = filter.$or.find((entry) => entry.id?.$regex);
    assert.ok(matches(idClause!.id!.$regex!, "OGN001"));
    assert.ok(!matches(idClause!.id!.$regex!, "XOGN001"));
  });
});
