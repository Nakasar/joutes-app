import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { riftboundCardName } from "./riftbound-name";

/**
 * Nom des cartes importées depuis la galerie officielle de Riftbound. Les cas
 * reprennent la forme réelle des cartes publiées (octobre 2026).
 *
 * Exécution : `npm run test`.
 */

const unit = (superType?: string) => ({
  type: [{ label: "Unit" }],
  superType: superType ? [{ label: superType }] : [],
});

describe("riftboundCardName", () => {
  it("recolle le titre d'une unité championne", () => {
    assert.equal(
      riftboundCardName({ name: "Kai'Sa", subtitle: "Survivor", cardType: unit("Champion"), tags: { tags: ["Kai'Sa", "The Void"] } }),
      "Kai'Sa, Survivor",
    );
    assert.equal(riftboundCardName({ name: "Master Yi", subtitle: "Meditative", cardType: unit("Champion") }), "Master Yi, Meditative");
  });

  it("ne double pas un titre déjà dans le nom", () => {
    assert.equal(riftboundCardName({ name: "Kai'Sa, Survivor", subtitle: "Survivor", cardType: unit("Champion") }), "Kai'Sa, Survivor");
    assert.equal(riftboundCardName({ name: "Kai'Sa, Survivor", cardType: unit("Champion") }), "Kai'Sa, Survivor");
  });

  it("n'ajoute pas le champion lié à une carte signature", () => {
    assert.equal(
      riftboundCardName({ name: "Icathian Rain", subtitle: "Kai'Sa", cardType: { type: [{ label: "Spell" }], superType: [{ label: "Signature" }] } }),
      "Icathian Rain",
    );
    assert.equal(riftboundCardName({ name: "Tibbers", subtitle: "Annie", cardType: unit("Signature") }), "Tibbers");
  });

  it("préfixe une légende du champion de sa première étiquette, sans le « Starter »", () => {
    assert.equal(
      riftboundCardName({ name: "Bashful Bloom", subtitle: null, cardType: { type: [{ label: "Legend" }] }, tags: { tags: ["Lillia"] } }),
      "Lillia, Bashful Bloom",
    );
    assert.equal(
      riftboundCardName({ name: "Dark Child", subtitle: "Starter", cardType: { type: [{ label: "Legend" }], superType: [{ label: "Champion" }] }, tags: { tags: ["Annie"] } }),
      "Annie, Dark Child",
    );
  });

  it("laisse tel quel le nom d'une unité ordinaire", () => {
    assert.equal(riftboundCardName({ name: "Allay, Eager Admirer", cardType: unit() }), "Allay, Eager Admirer");
  });
});
