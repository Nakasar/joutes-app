import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderedPriceSources, otherCardPrices, referenceCardPrice } from "./preference";
import { CARD_PRICE_SOURCES, type CardPrice, type CardPriceValues } from "@/lib/types/card-price";

/**
 * La préférence d'un joueur, ramenée à un ordre de fournisseurs.
 *
 * Ce qui est en jeu : le prix qu'une carte affiche dans une grille et celui que
 * sa fiche montre en grand doivent être le même, et le réglage ne doit jamais
 * faire disparaître un prix sans que le joueur l'ait demandé.
 *
 * Exécution : `npm run test`.
 */

function price(source: CardPrice["source"], prices: CardPriceValues): CardPrice {
  return {
    cardId: "UNL-131",
    source,
    currency: "EUR",
    prices,
    offers: [],
    sourceUpdatedAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T06:00:00.000Z",
  };
}

describe("orderedPriceSources", () => {
  it("suit la plateforme quand le joueur n'a rien choisi", () => {
    assert.deepEqual(orderedPriceSources(undefined), CARD_PRICE_SOURCES);
    assert.deepEqual(orderedPriceSources({}), CARD_PRICE_SOURCES);
  });

  it("met le fournisseur choisi devant, sans écarter les autres", () => {
    assert.deepEqual(orderedPriceSources({ source: "cardmarket" }), ["cardmarket", "cardnexus"]);
  });

  it("n'en garde qu'un quand le joueur refuse le repli", () => {
    assert.deepEqual(orderedPriceSources({ source: "cardmarket", fallback: false }), ["cardmarket"]);
  });

  it("répond à un fournisseur inconnu par l'ordre de la plateforme", () => {
    // Un fournisseur retiré de la plateforme laisse des préférences qui le
    // nomment encore : elles ne doivent pas vider les prix de ceux-là.
    assert.deepEqual(
      orderedPriceSources({ source: "tcgplayer" as never, fallback: false }),
      CARD_PRICE_SOURCES
    );
  });
});

describe("referenceCardPrice", () => {
  const cardnexus = price("cardnexus", { trend: 0.25, low: 0.9 });
  const cardmarket = price("cardmarket", { trend: 0.31, low: 0.28 });

  it("prend le premier fournisseur de la liste qui cote la carte", () => {
    assert.equal(referenceCardPrice([cardnexus, cardmarket], ["cardmarket", "cardnexus"]), cardmarket);
    assert.equal(referenceCardPrice([cardnexus, cardmarket], ["cardnexus", "cardmarket"]), cardnexus);
  });

  it("laisse la place au suivant quand le premier ne porte aucun montant", () => {
    // Un relevé sans montant ne représente pas la carte : c'est la règle de
    // `getMarketPrices`, et la fiche doit montrer le même prix que la grille.
    const muet = price("cardmarket", {});
    assert.equal(referenceCardPrice([muet, cardnexus], ["cardmarket", "cardnexus"]), cardnexus);
  });

  it("ne remonte rien quand le fournisseur choisi ignore la carte et que le repli est coupé", () => {
    assert.equal(referenceCardPrice([cardnexus], ["cardmarket"]), undefined);
  });
});

describe("otherCardPrices", () => {
  const cardnexus = price("cardnexus", { trend: 0.25 });
  const cardmarket = price("cardmarket", { trend: 0.31 });

  it("montre tous les relevés que la carte porte, sauf celui qui la représente", () => {
    assert.deepEqual(otherCardPrices([cardnexus, cardmarket], cardnexus), [cardmarket]);
  });

  it("montre aussi un relevé sans montant : la place de marché suit la carte sans savoir la situer", () => {
    const muet = price("cardmarket", {});
    assert.deepEqual(otherCardPrices([cardnexus, muet], cardnexus), [muet]);
  });

  it("les montre tous quand aucun ne représente la carte", () => {
    assert.equal(otherCardPrices([cardnexus, cardmarket], undefined).length, 2);
  });
});
