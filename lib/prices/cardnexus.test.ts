import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CARDNEXUS_AFFILIATE_ID, CARDNEXUS_ORDER_MAX_LINES, cardnexusOrderUrl, cardnexusProductUrl } from "./cardnexus";

/**
 * Les adresses que l'application construit vers CardNexus : la page d'un
 * produit, et le lien de commande affilié d'une liste de produits
 * (https://docs.cardnexus.com/affiliates).
 *
 * Exécution : `npm run test`.
 */

describe("cardnexusProductUrl", () => {
  it("porte l'identifiant du produit, seul segment que CardNexus lit", () => {
    assert.equal(cardnexusProductUrl("riftbound", 812), "https://cardnexus.com/en/explore/riftbound/card/card/card-812");
  });

  it("n'invente pas de lien pour un jeu que CardNexus ne connaît pas", () => {
    assert.equal(cardnexusProductUrl("yugioh", 812), undefined);
  });
});

describe("cardnexusOrderUrl", () => {
  it("commence par l'identifiant de partenaire et n'écrit qu'un identifiant par produit voulu à l'unité", () => {
    assert.equal(
      cardnexusOrderUrl([{ productId: 512003 }, { productId: 631412, quantity: 1 }]),
      `https://af.cardnexus.link/${CARDNEXUS_AFFILIATE_ID}/products/cn/512003~631412`
    );
  });

  it("écrit la quantité, la langue et le tirage dans cet ordre, sans les champs de fin absents", () => {
    assert.equal(
      cardnexusOrderUrl([
        { productId: 728934, quantity: 4, language: "fr", finish: "f" },
        { productId: 631412, quantity: 2 },
        { productId: 498812, quantity: 3, language: "en" },
      ]),
      `https://af.cardnexus.link/${CARDNEXUS_AFFILIATE_ID}/products/cn/728934.4.fr.f~631412.2~498812.3.en`
    );
  });

  it("laisse vide un champ du milieu plutôt que de décaler les suivants", () => {
    // `50212.4..f` : 4 exemplaires, n'importe quelle langue, foil — l'exemple de la documentation.
    assert.equal(cardnexusOrderUrl([{ productId: 50212, quantity: 4, finish: "f" }])?.split("/cn/")[1], "50212.4..f");
    // La quantité est écrite dès qu'un champ la suit, même à 1.
    assert.equal(cardnexusOrderUrl([{ productId: 50212, finish: "f" }])?.split("/cn/")[1], "50212.1..f");
  });

  it("n'écrit que des caractères que le lien accepte tels quels", () => {
    const url = cardnexusOrderUrl([{ productId: 50212, quantity: 2, language: "zh-Hans", finish: "rainbow foil" }]);
    assert.equal(url?.split("/cn/")[1], "50212.2.zh-Hans");
    assert.match(url ?? "", /^https:\/\/af\.cardnexus\.link\/[0-9]+\/products\/cn\/[A-Za-z0-9.~-]+$/);
  });

  it("ramène une quantité fantaisiste à un entier d'au moins un", () => {
    assert.equal(cardnexusOrderUrl([{ productId: 50212, quantity: 0 }])?.split("/cn/")[1], "50212");
    assert.equal(cardnexusOrderUrl([{ productId: 50212, quantity: 2.7 }])?.split("/cn/")[1], "50212.2");
  });

  it("écarte les produits sans identifiant valable, et ne rend rien sans aucune ligne", () => {
    assert.equal(cardnexusOrderUrl([]), undefined);
    assert.equal(cardnexusOrderUrl([{ productId: Number.NaN }, { productId: -3 }]), undefined);
    assert.equal(cardnexusOrderUrl([{ productId: Number.NaN }, { productId: 7 }])?.split("/cn/")[1], "7");
  });

  it("s'arrête à ce que CardNexus lit : les lignes au-delà de la limite ne sont pas envoyées", () => {
    const lines = Array.from({ length: CARDNEXUS_ORDER_MAX_LINES + 5 }, (_, index) => ({ productId: index + 1 }));
    const sent = cardnexusOrderUrl(lines)?.split("/cn/")[1].split("~") ?? [];
    assert.equal(sent.length, CARDNEXUS_ORDER_MAX_LINES);
    assert.equal(sent[sent.length - 1], String(CARDNEXUS_ORDER_MAX_LINES));
  });
});
