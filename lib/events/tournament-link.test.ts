import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canManageEvent, pendingTransferCount, playerStatusForRegistration } from "./tournament-link";

describe("playerStatusForRegistration", () => {
  it("transfère les inscrits et les pré-inscrits avec leur statut", () => {
    assert.equal(playerStatusForRegistration("REGISTERED"), "registered");
    assert.equal(playerStatusForRegistration("PRE_REGISTERED"), "pre-registered");
  });

  it("transfère un exclu comme joueur retiré", () => {
    assert.equal(playerStatusForRegistration("EXCLUDED"), "dropped");
  });

  it("ne transfère pas un non-inscrit", () => {
    assert.equal(playerStatusForRegistration("NOT_REGISTERED"), null);
  });

  it("traite une inscription sans statut comme une inscription", () => {
    assert.equal(playerStatusForRegistration(undefined), "registered");
  });
});

describe("canManageEvent", () => {
  const event = {
    creatorId: "creator",
    staff: [
      { userId: "orga", role: "organizer" as const },
      { userId: "judge", role: "judge" as const },
    ],
  };

  it("ouvre au créateur et au staff organisateur", () => {
    assert.equal(canManageEvent(event, "creator"), true);
    assert.equal(canManageEvent(event, "orga"), true);
  });

  it("ferme aux arbitres, aux autres et aux visiteurs", () => {
    assert.equal(canManageEvent(event, "judge"), false);
    assert.equal(canManageEvent(event, "someone"), false);
    assert.equal(canManageEvent(event, undefined), false);
  });

  it("tient sans staff", () => {
    assert.equal(canManageEvent({ creatorId: "creator" }, "orga"), false);
  });
});

describe("pendingTransferCount", () => {
  it("compte les ajouts et les changements de statut", () => {
    assert.equal(pendingTransferCount({ toAdd: [1, 2], toUpdate: [3] }), 3);
    assert.equal(pendingTransferCount({ toAdd: [], toUpdate: [] }), 0);
  });
});
