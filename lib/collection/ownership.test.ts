import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCards,
  annotateBoosterCards,
  ownedCopies,
  printingKey,
  type OwnershipSnapshot,
} from "./ownership";

/**
 * Tests du décompte affiché pendant l'ouverture d'un booster. Le seul point
 * réellement visible par l'ouvreur est la mention « première » : elle ne doit
 * apparaître qu'une fois, sur le tout premier exemplaire d'une carte.
 *
 * Exécution : `npm run test`.
 */

const card = (name: string, setCode: string, collectorNumber: string, id = `${name}-${collectorNumber}`) => ({
  id,
  name,
  setCode,
  collectorNumber,
});

function snapshot(...owned: { name: string; setCode: string; collectorNumber: string }[]): OwnershipSnapshot {
  return addCards({}, owned);
}

describe("ownedCopies", () => {
  it("distingue l'impression exacte du total toutes variantes", () => {
    const owned = snapshot(
      card("Ashe", "OGN", "001"),
      card("Ashe", "OGN", "001"),
      card("Ashe", "OGN", "250")
    );

    assert.deepEqual(ownedCopies(owned, card("Ashe", "OGN", "001")), { copies: 2, variantCopies: 3 });
    assert.deepEqual(ownedCopies(owned, card("Ashe", "OGN", "250")), { copies: 1, variantCopies: 3 });
  });

  it("renvoie zéro pour une carte absente de la collection", () => {
    assert.deepEqual(ownedCopies({}, card("Ashe", "OGN", "001")), { copies: 0, variantCopies: 0 });
  });

  it("ne confond pas deux impressions homonymes d'extensions différentes", () => {
    const owned = snapshot(card("Ashe", "OGN", "001"));

    assert.equal(ownedCopies(owned, card("Ashe", "PRE", "001")).copies, 0);
    assert.equal(ownedCopies(owned, card("Ashe", "PRE", "001")).variantCopies, 1);
  });
});

describe("addCards", () => {
  it("laisse le snapshot d'origine intact", () => {
    const owned = snapshot(card("Ashe", "OGN", "001"));
    const merged = addCards(owned, [card("Ashe", "OGN", "001")]);

    assert.equal(owned["Ashe"].total, 1);
    assert.equal(owned["Ashe"].printings[printingKey(card("Ashe", "OGN", "001"))], 1);
    assert.equal(merged["Ashe"].total, 2);
    assert.equal(merged["Ashe"].printings[printingKey(card("Ashe", "OGN", "001"))], 2);
  });
});

describe("annotateBoosterCards", () => {
  it("met en avant le premier exemplaire d'une carte jamais possédée", () => {
    const annotations = annotateBoosterCards({}, [card("Ashe", "OGN", "001")]);

    assert.deepEqual(annotations["Ashe-001"], { copies: 1, variantCopies: 1, first: true });
  });

  it("ne met en avant qu'un seul exemplaire quand le booster en contient deux", () => {
    const cards = [card("Ashe", "OGN", "001", "a"), card("Ashe", "OGN", "001", "b")];

    const annotations = annotateBoosterCards({}, cards);

    assert.deepEqual(annotations["a"], { copies: 1, variantCopies: 1, first: true });
    assert.deepEqual(annotations["b"], { copies: 2, variantCopies: 2, first: false });
  });

  it("ne met pas en avant une variante d'une carte déjà possédée", () => {
    const owned = snapshot(card("Ashe", "OGN", "001"));

    const annotations = annotateBoosterCards(owned, [card("Ashe", "OGN", "250", "alt")]);

    assert.deepEqual(annotations["alt"], { copies: 0 + 1, variantCopies: 2, first: false });
  });

  it("compte les exemplaires déjà en collection avant ceux du booster", () => {
    const owned = snapshot(card("Ashe", "OGN", "001"), card("Ashe", "OGN", "001"));

    const annotations = annotateBoosterCards(owned, [card("Ashe", "OGN", "001", "c")]);

    assert.deepEqual(annotations["c"], { copies: 3, variantCopies: 3, first: false });
  });

  it("numérote indépendamment deux cartes différentes du même booster", () => {
    const cards = [card("Ashe", "OGN", "001"), card("Jinx", "OGN", "002")];

    const annotations = annotateBoosterCards(snapshot(card("Jinx", "OGN", "002")), cards);

    assert.equal(annotations["Ashe-001"].first, true);
    assert.equal(annotations["Jinx-002"].first, false);
    assert.equal(annotations["Jinx-002"].copies, 2);
  });
});
