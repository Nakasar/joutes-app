import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventsSourceHelpRequestSchema, isWebUrl, managerEventSourceSchema, webUrlSchema } from "./lair.schema.ts";

describe("une adresse web", () => {
  it("n'accepte que http et https", () => {
    assert.equal(isWebUrl("https://www.antretemps.com/evenements"), true);
    assert.equal(isWebUrl("http://boutique.fr/agenda"), true);
    assert.equal(isWebUrl("javascript:alert(1)"), false);
    assert.equal(isWebUrl("data:text/html,hello"), false);
    assert.equal(isWebUrl("mailto:contact@joutes.app"), false);
    assert.equal(isWebUrl("pas une adresse"), false);
  });

  it("est ce que le gérant peut connecter ou envoyer à l'équipe", () => {
    assert.equal(webUrlSchema.safeParse("  https://boutique.fr/agenda ").success, true);
    assert.equal(webUrlSchema.safeParse("javascript:alert(1)").success, false);
    assert.equal(managerEventSourceSchema.safeParse({ url: "ftp://boutique.fr", presetKey: "oasis" }).success, false);
    assert.equal(eventsSourceHelpRequestSchema.safeParse({ url: "" }).success, true);
    assert.equal(eventsSourceHelpRequestSchema.safeParse({ url: "data:text/html,x" }).success, false);
  });
});
