import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canManagePlayGroup,
  isPlayGroupListable,
  readMemberRole,
  readPlayGroupVisibility,
  readRollFilter,
} from "./access";
import type { PlayGroup } from "@/lib/types/PlayGroup";

/**
 * Les droits sur un groupe de jeu, et sa visibilité.
 *
 * Ce que ces cas verrouillent : un groupe créé avant le réglage de visibilité
 * reste public — le champ absent ne doit jamais faire disparaître un groupe
 * existant du rôle d'armes — et un groupe privé n'y paraît que pour ses
 * membres, quel que soit leur rang.
 *
 * Exécution : `npm run test`.
 */

function group(overrides: Partial<PlayGroup> = {}): Pick<PlayGroup, "visibility" | "members"> {
  return {
    members: [
      { userId: "fondateur", role: "owner", joinedAt: "2026-01-01T00:00:00.000Z" },
      { userId: "adjoint", role: "admin", joinedAt: "2026-01-02T00:00:00.000Z" },
      { userId: "membre", role: "member", joinedAt: "2026-01-03T00:00:00.000Z" },
    ],
    ...overrides,
  };
}

describe("readPlayGroupVisibility", () => {
  it("lit un groupe sans réglage comme public", () => {
    assert.equal(readPlayGroupVisibility({}), "public");
    assert.equal(readPlayGroupVisibility({ visibility: undefined }), "public");
  });

  it("rend les deux valeurs enregistrées", () => {
    assert.equal(readPlayGroupVisibility({ visibility: "public" }), "public");
    assert.equal(readPlayGroupVisibility({ visibility: "private" }), "private");
  });
});

describe("isPlayGroupListable", () => {
  it("montre un groupe public à tout le monde, connecté ou non", () => {
    assert.ok(isPlayGroupListable(group({ visibility: "public" }), null));
    assert.ok(isPlayGroupListable(group({ visibility: "public" }), "inconnu"));
  });

  it("montre un groupe sans réglage à tout le monde", () => {
    assert.ok(isPlayGroupListable(group(), null));
  });

  it("cache un groupe privé à un visiteur et à un non-membre", () => {
    assert.equal(isPlayGroupListable(group({ visibility: "private" }), null), false);
    assert.equal(isPlayGroupListable(group({ visibility: "private" }), "inconnu"), false);
  });

  it("montre un groupe privé à ses membres, quel que soit leur rang", () => {
    const prive = group({ visibility: "private" });

    assert.ok(isPlayGroupListable(prive, "fondateur"));
    assert.ok(isPlayGroupListable(prive, "adjoint"));
    assert.ok(isPlayGroupListable(prive, "membre"));
  });
});

describe("readMemberRole", () => {
  it("rend le rang du membre", () => {
    assert.equal(readMemberRole(group(), "adjoint"), "admin");
  });

  it("rend null pour un inconnu ou un visiteur", () => {
    assert.equal(readMemberRole(group(), "inconnu"), null);
    assert.equal(readMemberRole(group(), null), null);
  });
});

describe("canManagePlayGroup", () => {
  it("ouvre la gestion au fondateur et aux admins seulement", () => {
    assert.ok(canManagePlayGroup("owner"));
    assert.ok(canManagePlayGroup("admin"));
    assert.equal(canManagePlayGroup("member"), false);
    assert.equal(canManagePlayGroup(null), false);
  });
});

describe("readRollFilter", () => {
  it("ne demande que les groupes non privés à un visiteur", () => {
    assert.deepEqual(readRollFilter(null), { visibility: { $ne: "private" } });
    assert.deepEqual(readRollFilter(undefined), { visibility: { $ne: "private" } });
  });

  it("ajoute les groupes du lecteur, privés compris", () => {
    assert.deepEqual(readRollFilter("moi"), {
      $or: [{ visibility: { $ne: "private" } }, { "members.userId": "moi" }],
    });
  });

  it("dit la même chose que la règle écrite en clair", () => {
    // Le filtre part en base, la règle sert aux vues : les deux doivent trier
    // la même liste, sans quoi un groupe privé s'afficherait quelque part.
    const groups = [
      { visibility: "public" as const, members: [] },
      { visibility: undefined, members: [] },
      { visibility: "private" as const, members: [] },
      { visibility: "private" as const, members: [{ userId: "moi", role: "member" as const, joinedAt: "" }] },
    ];

    assert.deepEqual(
      groups.map((entry) => isPlayGroupListable(entry, "moi")),
      [true, true, false, true],
    );
    assert.deepEqual(
      groups.map((entry) => isPlayGroupListable(entry, null)),
      [true, true, false, false],
    );
  });
});
