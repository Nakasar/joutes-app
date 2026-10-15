import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findActiveAdminNavHref } from "./navigation";

describe("entrée active du menu de l'administration", () => {
  it("allume l'accueil sur /admin", () => {
    assert.equal(findActiveAdminNavHref("/admin"), "/admin");
  });

  it("allume la section d'une fiche plutôt que l'accueil", () => {
    assert.equal(findActiveAdminNavHref("/admin/lairs/123"), "/admin/lairs");
    assert.equal(findActiveAdminNavHref("/admin/games/riftbound"), "/admin/games");
  });

  it("ne confond pas deux adresses qui ne partagent qu'un début de mot", () => {
    assert.equal(findActiveAdminNavHref("/admin/reportsx"), "/admin");
  });

  it("ne renvoie rien hors de l'administration", () => {
    assert.equal(findActiveAdminNavHref("/lairs/123"), undefined);
  });
});
