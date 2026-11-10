import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCommentThread,
  canReadSpace,
  commentPermissions,
  countCommentsByCard,
  isUnread,
  parseCommentSpace,
  removedCommentedCards,
  validateCommentInput,
  type SpaceContext,
} from "./comments";
import type { DeckComment } from "@/lib/types/DeckComment";

/**
 * Les commentaires de deck : qui lit quel espace, ce qu'un commentaire
 * contient, qui en fait quoi, et la forme du fil.
 *
 * Exécution : `npm run test`.
 */

const personal = { kind: "personal" } as const;
const group = { kind: "group", playGroupId: "corbeaux" } as const;

describe("parseCommentSpace", () => {
  it("reconnaît l'espace personnel et celui d'un groupe", () => {
    assert.deepEqual(parseCommentSpace("personal"), personal);
    assert.deepEqual(parseCommentSpace("group:corbeaux"), group);
  });

  it("refuse le reste", () => {
    assert.equal(parseCommentSpace("public"), null);
    assert.equal(parseCommentSpace("group:"), null);
    assert.equal(parseCommentSpace(undefined), null);
  });
});

describe("canReadSpace", () => {
  it("réserve l'espace personnel à l'auteur du deck", () => {
    assert.equal(canReadSpace({ deckOwnerId: "auteur", userId: "auteur", space: personal }), true);
    assert.equal(canReadSpace({ deckOwnerId: "auteur", userId: "membre", space: personal }), false);
  });

  it("ouvre le fil d'un groupe à ses membres, tant que le deck y est", () => {
    const base = { deckOwnerId: "auteur", userId: "membre", space: group } as const;
    assert.equal(canReadSpace({ ...base, groupRole: "member", deckInGroup: true }), true);
    assert.equal(canReadSpace({ ...base, groupRole: "member", deckInGroup: false }), false);
    assert.equal(canReadSpace({ ...base, groupRole: null, deckInGroup: true }), false);
  });

  it("le referme à un visiteur non connecté", () => {
    assert.equal(canReadSpace({ deckOwnerId: "auteur", userId: null, space: personal }), false);
  });
});

describe("commentPermissions", () => {
  const groupContext = (userId: string, groupRole: "owner" | "admin" | "member"): SpaceContext => ({
    deckOwnerId: "auteur",
    userId,
    space: group,
    groupRole,
    deckInGroup: true,
  });
  const comment = { authorId: "lisa" };

  it("laisse l'auteur du commentaire le modifier, le supprimer et le résoudre", () => {
    assert.deepEqual(commentPermissions(comment, groupContext("lisa", "member")), {
      canEdit: true,
      canDelete: true,
      canResolve: true,
    });
  });

  it("laisse l'auteur du deck le supprimer et le résoudre, sans le modifier", () => {
    assert.deepEqual(commentPermissions(comment, groupContext("auteur", "member")), {
      canEdit: false,
      canDelete: true,
      canResolve: true,
    });
  });

  it("laisse un responsable du groupe le supprimer, pas un autre membre", () => {
    assert.equal(commentPermissions(comment, groupContext("chef", "admin")).canDelete, true);
    assert.equal(commentPermissions(comment, groupContext("voisin", "member")).canDelete, false);
  });

  it("ne résout pas une réponse", () => {
    assert.equal(commentPermissions({ ...comment, parentId: "racine" }, groupContext("lisa", "member")).canResolve, false);
  });
});

describe("validateCommentInput", () => {
  const deck = ["gust", "rush", "kennen"];

  it("nettoie le texte et dédoublonne les cartes", () => {
    assert.deepEqual(validateCommentInput({ body: "  Trop de Gust  ", cardIds: ["gust", "gust"] }, deck), {
      ok: true,
      body: "Trop de Gust",
      cardIds: ["gust"],
    });
  });

  it("refuse un texte vide ou trop long", () => {
    assert.deepEqual(validateCommentInput({ body: "   " }, deck), { ok: false, error: "EMPTY" });
    assert.deepEqual(validateCommentInput({ body: "x".repeat(2001) }, deck), { ok: false, error: "TOO_LONG" });
  });

  it("refuse une carte qui n'est pas dans le deck", () => {
    assert.deepEqual(validateCommentInput({ body: "ok", cardIds: ["seal"] }, deck), {
      ok: false,
      error: "CARD_NOT_IN_DECK",
    });
  });

  it("refuse plus de dix cartes, et des cartes sur une réponse", () => {
    const many = Array.from({ length: 11 }, (_, index) => `c${index}`);
    assert.deepEqual(validateCommentInput({ body: "ok", cardIds: many }, many), { ok: false, error: "TOO_MANY_CARDS" });
    assert.deepEqual(validateCommentInput({ body: "ok", cardIds: ["gust"], isReply: true }, deck), {
      ok: false,
      error: "REPLY_WITH_CARDS",
    });
  });
});

function comment(id: string, createdAt: string, overrides: Partial<DeckComment> = {}): DeckComment {
  return {
    id,
    deckId: "deck",
    space: "group:corbeaux",
    authorId: "lisa",
    body: id,
    cardIds: [],
    cardNames: {},
    deckVersion: 3,
    createdAt,
    ...overrides,
  };
}

describe("buildCommentThread", () => {
  const context: SpaceContext = { deckOwnerId: "auteur", userId: "auteur", space: group, groupRole: "member", deckInGroup: true };

  it("range les racines de la plus récente à la plus ancienne, et leurs réponses dans l'ordre", () => {
    const thread = buildCommentThread(
      [
        comment("vieux", "2026-11-01T00:00:00Z"),
        comment("récent", "2026-11-05T00:00:00Z"),
        comment("réponse 2", "2026-11-03T00:00:00Z", { parentId: "vieux" }),
        comment("réponse 1", "2026-11-02T00:00:00Z", { parentId: "vieux" }),
      ],
      context,
      [],
    );

    assert.deepEqual(
      thread.map((root) => [root.id, root.replies.map((reply) => reply.id)]),
      [
        ["récent", []],
        ["vieux", ["réponse 1", "réponse 2"]],
      ],
    );
  });

  it("barre une carte retirée du deck, sans perdre son nom", () => {
    const [root] = buildCommentThread(
      [comment("c", "2026-11-01T00:00:00Z", { cardIds: ["gust", "seal"], cardNames: { gust: "Gust", seal: "Seal of Discord" } })],
      context,
      ["gust"],
    );

    assert.deepEqual(root.cards, [
      { id: "gust", name: "Gust", removed: false },
      { id: "seal", name: "Seal of Discord", removed: true },
    ]);
    assert.deepEqual(removedCommentedCards([root]), [{ id: "seal", name: "Seal of Discord", count: 1 }]);
    assert.deepEqual(countCommentsByCard([root]), { gust: 1, seal: 1 });
  });

  it("garde une racine supprimée qui a des réponses, vidée, et oublie les autres", () => {
    const thread = buildCommentThread(
      [
        comment("seule", "2026-11-01T00:00:00Z", { deletedAt: "2026-11-02T00:00:00Z" }),
        comment("racine", "2026-11-03T00:00:00Z", { deletedAt: "2026-11-04T00:00:00Z", body: "secret" }),
        comment("réponse", "2026-11-03T12:00:00Z", { parentId: "racine" }),
      ],
      context,
      [],
    );

    assert.deepEqual(thread.map((root) => [root.id, root.deleted, root.body]), [["racine", true, ""]]);
  });
});

describe("isUnread", () => {
  it("ne compte que les commentaires d'autrui écrits depuis le dernier passage", () => {
    const fresh = { authorId: "lisa", createdAt: "2026-11-05T00:00:00Z" };
    assert.equal(isUnread(fresh, "moi", "2026-11-04T00:00:00Z"), true);
    assert.equal(isUnread(fresh, "moi", "2026-11-06T00:00:00Z"), false);
    assert.equal(isUnread(fresh, "lisa", undefined), false);
    assert.equal(isUnread({ ...fresh, deletedAt: "2026-11-05T01:00:00Z" }, "moi", undefined), false);
  });
});
