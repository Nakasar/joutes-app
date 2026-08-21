import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { STREAM_MAX_TARGETS, type StreamTarget } from "@/lib/types/StreamLink";
import { addTarget, hasTarget, removeTarget, targetKey } from "./targets";

/**
 * Les destinations d'une liaison.
 *
 * Ce que ces cas verrouillent : un lieu et un groupe qui portent le même
 * identifiant restent deux destinations distinctes — les deux collections ont
 * leurs propres identifiants, et rien n'interdit une collision —, le doublon est
 * refusé plutôt qu'absorbé, et la borne tient.
 *
 * Exécution : `npm run test`.
 */

const LAIR: StreamTarget = { kind: "lair", id: "64f0000000000000000000aa" };
const GROUP: StreamTarget = { kind: "play-group", id: "64f0000000000000000000aa" };

describe("targetKey", () => {
  it("distingue un lieu d'un groupe au même identifiant", () => {
    assert.notEqual(targetKey(LAIR), targetKey(GROUP));
  });
});

describe("addTarget", () => {
  it("ajoute à la fin", () => {
    const result = addTarget([LAIR], GROUP);

    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? result.targets : null, [LAIR, GROUP]);
  });

  it("refuse un doublon", () => {
    const result = addTarget([LAIR], { ...LAIR });

    assert.deepEqual(result, { ok: false, reason: "ALREADY_ADDED" });
  });

  it("refuse au-delà de la borne", () => {
    const full = Array.from({ length: STREAM_MAX_TARGETS }, (_, index) => ({
      kind: "lair" as const,
      id: `lieu-${index}`,
    }));

    assert.deepEqual(addTarget(full, GROUP), { ok: false, reason: "TOO_MANY_TARGETS" });
  });

  it("ne modifie pas la liste reçue", () => {
    const targets = [LAIR];
    addTarget(targets, GROUP);

    assert.deepEqual(targets, [LAIR]);
  });
});

describe("removeTarget", () => {
  it("ne retire que la destination visée", () => {
    assert.deepEqual(removeTarget([LAIR, GROUP], LAIR), [GROUP]);
  });

  it("est sans effet sur une destination absente", () => {
    assert.deepEqual(removeTarget([LAIR], GROUP), [LAIR]);
  });
});

describe("hasTarget", () => {
  it("compare la nature et l'identifiant, pas la référence", () => {
    assert.equal(hasTarget([LAIR], { kind: "lair", id: LAIR.id }), true);
    assert.equal(hasTarget([LAIR], GROUP), false);
  });
});
