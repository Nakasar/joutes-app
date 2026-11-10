import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyRiftboundCorrection, riftboundCorrectionFields, RIFTBOUND_CORRECTIONS } from "./riftbound-corrections";

/** Exécution : `npm run test`. */
describe("corrections Radiance", () => {
  it("couvre les 50 cartes signalées", () => {
    assert.equal(Object.keys(RIFTBOUND_CORRECTIONS).length, 50);
  });

  it("corrige le domaine seul sans toucher au type", () => {
    const card = applyRiftboundCorrection({ id: "RAD001", type: "Unit", types: ["Unit"], domain: ["Chaos"] });
    assert.deepEqual(card, { id: "RAD001", type: "Unit", types: ["Unit"], domain: ["Fury"] });
  });

  it("corrige le type seul sans toucher au domaine", () => {
    const card = applyRiftboundCorrection({ id: "RAD007", type: "Gear", types: ["Gear"], domain: ["Fury"] });
    assert.deepEqual(card, { id: "RAD007", type: "Spell", types: ["Spell"], domain: ["Fury"] });
  });

  it("remplit une carte dont la galerie ne donne ni type ni domaine", () => {
    const card = applyRiftboundCorrection({ id: "RAD006" });
    assert.deepEqual(card, { id: "RAD006", type: "Spell", types: ["Spell"], domain: ["Fury"] });
  });

  it("corrige type et domaine ensemble", () => {
    assert.deepEqual(riftboundCorrectionFields("RAD059"), { type: "Spell", types: ["Spell"], domain: ["Mind"] });
  });

  it("laisse les autres cartes intactes", () => {
    const card = { id: "RAD002", type: "Unit", domain: ["Fury"] };
    assert.equal(applyRiftboundCorrection(card), card);
    assert.equal(riftboundCorrectionFields("RAD002"), undefined);
  });
});
