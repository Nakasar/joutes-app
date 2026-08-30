import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { importedCardSearchDocument, searchDocumentId } from "./import-search";

/**
 * Document de recherche produit par les scripts d'import. Le point à ne pas
 * perdre : un import réécrit le document en entier, et les variantes
 * d'impression — saisies depuis l'administration, jamais publiées par la source
 * — doivent y être remises.
 *
 * Exécution : `npm run test`.
 */

const card = { id: "OGN001", name: "Ashe", setCode: "OGN", collectorNumber: "001" };

describe("searchDocumentId", () => {
  it("laisse un identifiant ordinaire tel quel", () => {
    assert.equal(searchDocumentId("OGN001"), "OGN001");
  });

  it("remplace les astérisques, que Meilisearch refuse dans une clé", () => {
    assert.equal(searchDocumentId("OGN001*"), "OGN001s");
  });
});

describe("importedCardSearchDocument", () => {
  it("garde l'identifiant réel dans cardId", () => {
    const document = importedCardSearchDocument({ ...card, id: "OGN001*" });

    assert.equal(document.id, "OGN001s");
    assert.equal(document.cardId, "OGN001*");
  });

  it("recopie les champs importés", () => {
    assert.deepEqual(importedCardSearchDocument(card), {
      ...card,
      cardId: "OGN001",
    });
  });

  it("remet les variantes enregistrées en base", () => {
    const printings = [{ id: "promo-pack", name: "Promo Pack", foil: true }];

    assert.deepEqual(importedCardSearchDocument(card, printings).printings, printings);
  });

  it("n'écrit pas de variantes quand la carte n'en a pas", () => {
    assert.equal("printings" in importedCardSearchDocument(card, []), false);
    assert.equal("printings" in importedCardSearchDocument(card), false);
  });
});
