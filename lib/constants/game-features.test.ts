import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GAME_FEATURE_KEYS, isGameFeatureKey, mergeGameFeatures } from "./game-features";

/**
 * Tests des fanions de fonctionnalités saisis dans l'administration. Ce qui
 * compte : décocher retire vraiment, et enregistrer ne détruit pas un fanion
 * que le formulaire ne connaît pas.
 *
 * Exécution : `npm run test`.
 */

describe("mergeGameFeatures", () => {
  it("n'écrit que les fanions activés", () => {
    const features = mergeGameFeatures({ cards: true, collection: true, cubes: false }, undefined);

    assert.deepEqual(features, { cards: true, collection: true });
  });

  it("retire un fanion décoché plutôt que de l'écrire à false", () => {
    const features = mergeGameFeatures({ cards: false }, { cards: true });

    assert.deepEqual(features, {});
  });

  it("active un fanion sur un jeu qui n'en avait aucun", () => {
    const features = mergeGameFeatures({ products: true }, {});

    assert.deepEqual(features, { products: true });
  });

  it("conserve une clé que la table ne connaît pas", () => {
    // Un fanion posé à la main en base ne doit pas être effacé par un simple
    // passage dans le formulaire, qui ne sait pas qu'il existe.
    const features = mergeGameFeatures({ cards: true }, { cards: true, experimental: true });

    assert.deepEqual(features, { experimental: true, cards: true });
  });

  it("ne ressuscite pas une clé inconnue déjà désactivée", () => {
    const features = mergeGameFeatures({}, { experimental: false });

    assert.deepEqual(features, {});
  });

  it("rend un objet vide quand rien n'est soumis et que rien n'existe", () => {
    assert.deepEqual(mergeGameFeatures(undefined, undefined), {});
  });

  // `undefined` et `{}` ne disent pas la même chose : l'un se tait sur les
  // fonctionnalités, l'autre les désactive toutes.
  it("ne touche à rien quand la saisie est absente", () => {
    const features = mergeGameFeatures(undefined, { cards: true, collection: true });

    assert.deepEqual(features, { cards: true, collection: true });
  });

  it("désactive tout quand la saisie est vide", () => {
    const features = mergeGameFeatures({}, { cards: true, collection: true });

    assert.deepEqual(features, {});
  });

  it("conserve aussi les clés inconnues quand la saisie est absente", () => {
    const features = mergeGameFeatures(undefined, { cards: true, experimental: true });

    assert.deepEqual(features, { cards: true, experimental: true });
  });

  it("ne recopie pas un fanion déjà à false quand la saisie est absente", () => {
    assert.deepEqual(mergeGameFeatures(undefined, { cards: false }), {});
  });
});

describe("isGameFeatureKey", () => {
  it("reconnaît les clés de la table", () => {
    for (const key of GAME_FEATURE_KEYS) {
      assert.equal(isGameFeatureKey(key), true);
    }
  });

  it("rejette tout le reste", () => {
    assert.equal(isGameFeatureKey("experimental"), false);
    assert.equal(isGameFeatureKey("toString"), false);
  });
});
