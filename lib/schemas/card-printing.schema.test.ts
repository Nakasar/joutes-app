import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cardPrintingSchema } from "./card.schema.ts";

/**
 * Identité propre d'une variante : son extension et son numéro, qui lui
 * rattachent ses prix (cf. docs/CARD_PRICES.md).
 *
 * Exécution : `npm run test`.
 */
describe("cardPrintingSchema", () => {
  it("accepte une variante sans identité propre", () => {
    assert.equal(cardPrintingSchema.safeParse({ name: "Promo" }).success, true);
  });

  it("accepte une extension et un numéro renseignés ensemble", () => {
    const result = cardPrintingSchema.safeParse({ name: "Beta", setCode: "WNCB", collectorNumber: "β141" });
    assert.equal(result.success, true);
  });

  it("refuse une extension sans numéro, et l'inverse", () => {
    const withoutNumber = cardPrintingSchema.safeParse({ name: "Beta", setCode: "WNCB" });
    assert.equal(withoutNumber.success, false);
    assert.deepEqual(withoutNumber.error?.issues[0].path, ["collectorNumber"]);

    const withoutSet = cardPrintingSchema.safeParse({ name: "Beta", collectorNumber: "β141" });
    assert.equal(withoutSet.success, false);
    assert.deepEqual(withoutSet.error?.issues[0].path, ["setCode"]);
  });

  it("tient un champ vide pour absent", () => {
    assert.equal(cardPrintingSchema.safeParse({ name: "Beta", setCode: "", collectorNumber: "" }).success, true);
  });
});
