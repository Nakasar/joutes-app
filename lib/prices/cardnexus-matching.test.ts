import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CardnexusExpansion, CardnexusProduct } from "./cardnexus";
import { matchCardnexusProducts, normalizePrintNumber, normalizeSetCode } from "./cardnexus-matching";
import type { PriceableCard } from "@/lib/types/card-price";

/**
 * Rapprochement des produits CardNexus et des cartes de la plateforme, par
 * extension et numéro de collection.
 *
 * Exécution : `npm run test`.
 */

function expansion(id: number, code: string | null, slug = `exp-${id}`): CardnexusExpansion {
  return { id, name: `Extension ${id}`, slug, code };
}

function product(id: number, expansionId: number | null, printNumber: string | null, overrides: Partial<CardnexusProduct> = {}): CardnexusProduct {
  return {
    id,
    productType: "card",
    name: `Carte ${id}`,
    nameSlug: `carte-${id}`,
    slug: `exp-carte-${id}`,
    expansionId,
    expansionSlug: expansionId === null ? null : `exp-${expansionId}`,
    printNumber,
    variant: null,
    ...overrides,
  };
}

function card(id: string, setCode: string, collectorNumber: string): PriceableCard {
  return { id, name: id, setCode, collectorNumber };
}

describe("normalizeSetCode", () => {
  it("ignore la casse et la ponctuation", () => {
    assert.equal(normalizeSetCode("OGN"), normalizeSetCode("ogn"));
    assert.equal(normalizeSetCode("SOR-1"), normalizeSetCode("sor1"));
  });
});

describe("normalizePrintNumber", () => {
  it("ignore les zéros de tête", () => {
    assert.equal(normalizePrintNumber("027"), normalizePrintNumber("27"));
    assert.equal(normalizePrintNumber("027a"), normalizePrintNumber("27a"));
  });

  it("garde le numéro lui-même", () => {
    assert.equal(normalizePrintNumber("100"), "100");
    assert.equal(normalizePrintNumber("0"), "0");
  });

  it("ne confond pas une variante avec son numéro de base", () => {
    assert.notEqual(normalizePrintNumber("027a"), normalizePrintNumber("027"));
  });

  it("efface la ponctuation d'un suffixe qu'aucun jeu ne déclare", () => {
    assert.equal(normalizePrintNumber("299*"), normalizePrintNumber("299"));
  });

  it("ramène à une même écriture les suffixes qu'un jeu déclare", () => {
    const riftbound = { "*": "s" };

    assert.equal(normalizePrintNumber("299*", riftbound), normalizePrintNumber("299s", riftbound));
    assert.notEqual(normalizePrintNumber("299*", riftbound), normalizePrintNumber("299", riftbound));
  });

  it("garde lisible un suffixe que la normalisation effacerait", () => {
    const mtg = { "★": "star" };

    assert.equal(normalizePrintNumber("222★", mtg), normalizePrintNumber("222★", mtg));
    assert.notEqual(normalizePrintNumber("222★", mtg), normalizePrintNumber("222", mtg));
    // L'étoile de Magic n'est pas son `s` d'avant-première, et les deux se
    // rencontrent sur une même carte.
    assert.notEqual(normalizePrintNumber("222★", mtg), normalizePrintNumber("222s", mtg));
    assert.notEqual(normalizePrintNumber("222s★", mtg), normalizePrintNumber("222★", mtg));
  });

  it("ne réécrit un suffixe qu'en fin de numéro", () => {
    assert.equal(normalizePrintNumber("1*2", { "*": "s" }), normalizePrintNumber("12"));
  });
});

describe("matchCardnexusProducts", () => {
  it("rapproche une carte par son extension et son numéro", async () => {
    const { matches } = await matchCardnexusProducts(
      [product(1, 42, "027")],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027")]
    );

    assert.deepEqual([...matches.keys()], ["OGN027"]);
    assert.equal(matches.get("OGN027")?.[0].id, 1);
  });

  it("rattache tous les produits d'un même numéro à la même carte", async () => {
    const { matches } = await matchCardnexusProducts(
      [product(1, 42, "27"), product(2, 42, "027", { variant: "Showcase" })],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027")]
    );

    assert.deepEqual(matches.get("OGN027")?.map((p) => p.id), [1, 2]);
  });

  it("distingue une variante de son numéro de base", async () => {
    const { matches } = await matchCardnexusProducts(
      [product(1, 42, "027"), product(2, 42, "027a")],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027"), card("OGN027a", "OGN", "027a")]
    );

    assert.equal(matches.get("OGN027")?.[0].id, 1);
    assert.equal(matches.get("OGN027a")?.[0].id, 2);
  });

  it("départage le tirage signé et sa carte de base quand le jeu déclare son suffixe", async () => {
    // Riftbound écrit `299*` là où CardNexus écrit tantôt `299s`, tantôt `299*`.
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, "299"), product(2, 42, "299s"), product(3, 43, "237"), product(4, 43, "237*")],
      [expansion(42, "OGN"), expansion(43, "UNL")],
      [
        card("OGN299", "OGN", "299"),
        card("OGN299s", "OGN", "299*"),
        card("UNL237", "UNL", "237"),
        card("UNL237s", "UNL", "237*"),
      ],
      { printNumberSuffixes: { "*": "s" } }
    );

    assert.equal(matches.get("OGN299")?.[0].id, 1);
    assert.equal(matches.get("OGN299s")?.[0].id, 2);
    assert.equal(matches.get("UNL237")?.[0].id, 3);
    assert.equal(matches.get("UNL237s")?.[0].id, 4);
    assert.equal(skipped.ambiguous, 0);
  });

  it("confond le tirage signé et sa carte de base sans suffixe déclaré", async () => {
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, "299")],
      [expansion(42, "OGN")],
      [card("OGN299", "OGN", "299"), card("OGN299s", "OGN", "299*")]
    );

    assert.equal(matches.size, 0);
    assert.equal(skipped.ambiguous, 1);
  });

  it("écarte les produits scellés", async () => {
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, null, { productType: "sealed", productCategory: "booster_box" } as Partial<CardnexusProduct>)],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027")]
    );

    assert.equal(matches.size, 0);
    assert.equal(skipped.sealed, 1);
  });

  it("n'attribue rien quand deux cartes partagent le même numéro", async () => {
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, "5")],
      [expansion(42, "SOR")],
      [card("SOR-5", "SOR", "5"), card("SOR-5-hyperspace", "SOR", "005")]
    );

    assert.equal(matches.size, 0);
    assert.equal(skipped.ambiguous, 1);
  });

  it("écarte une extension dont CardNexus ne publie pas le code", async () => {
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, "027")],
      [expansion(42, null)],
      [card("OGN027", "OGN", "027")]
    );

    assert.equal(matches.size, 0);
    assert.equal(skipped.unknownExpansion, 1);
  });

  it("retrouve par son slug une extension sans code, quand le profil le dit", async () => {
    const { matches } = await matchCardnexusProducts(
      [product(1, 42, "027")],
      [expansion(42, null, "origins")],
      [card("OGN027", "OGN", "027")],
      { setCodesBySlug: { origins: "OGN" } }
    );

    assert.equal(matches.get("OGN027")?.[0].id, 1);
  });

  it("traduit un code d'extension qui s'écrit autrement chez nous", async () => {
    const { matches } = await matchCardnexusProducts(
      [product(1, 42, "027")],
      [expansion(42, "ORIGINS")],
      [card("OGN027", "OGN", "027")],
      { setCodes: { ORIGINS: "OGN" } }
    );

    assert.equal(matches.get("OGN027")?.[0].id, 1);
  });

  it("compte, extension par extension, ce qui a été rapproché", async () => {
    const { expansions } = await matchCardnexusProducts(
      [product(1, 42, "027"), product(2, 42, "999")],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027")]
    );

    assert.deepEqual(expansions, [{ id: 42, name: "Extension 42", setCode: "OGN", products: 2, matched: 1 }]);
  });

  it("écarte un produit sans numéro de collection", async () => {
    const { matches, skipped } = await matchCardnexusProducts(
      [product(1, 42, null)],
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027")]
    );

    assert.equal(matches.size, 0);
    assert.equal(skipped.noPrintNumber, 1);
  });

  it("lit le catalogue en flux, sans le garder d'un bloc", async () => {
    // Le feed arrive en flux : le rapprochement doit s'en contenter, et ne le
    // parcourir qu'une fois — un générateur épuisé ne se relit pas.
    let read = 0;
    async function* catalogue(): AsyncGenerator<CardnexusProduct> {
      for (const p of [product(1, 42, "027"), product(2, 42, "028")]) {
        read++;
        yield p;
      }
    }

    const { matches } = await matchCardnexusProducts(
      catalogue(),
      [expansion(42, "OGN")],
      [card("OGN027", "OGN", "027"), card("OGN028", "OGN", "028")]
    );

    assert.equal(read, 2);
    assert.equal(matches.get("OGN027")?.[0].id, 1);
    assert.equal(matches.get("OGN028")?.[0].id, 2);
  });
});
