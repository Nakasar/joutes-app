import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeAudience, resolveAudience } from "./audience";

/**
 * Tests de la résolution des destinataires.
 *
 * Ce module est le miroir du `$match` d'autorisation de `getUserNotifications`
 * (`lib/db/notifications.ts`). Les deux doivent dire la même chose : si le push
 * atteint quelqu'un que le centre de notifications ne lui montre pas — ou
 * l'inverse — c'est ici que ça se verra.
 *
 * Exécution : `npm run test`.
 */

describe("describeAudience", () => {
  it("un utilisateur nommé", () => {
    assert.deepEqual(describeAudience({ type: "user", userId: "u1" }), {
      kind: "user",
      userId: "u1",
    });
  });

  it("un lair, selon la cible", () => {
    const lair = { type: "lair", lairId: "l1" } as const;

    assert.deepEqual(describeAudience({ ...lair, target: "owners" }), {
      kind: "lair", lairId: "l1", owners: true, followers: false,
    });
    assert.deepEqual(describeAudience({ ...lair, target: "followers" }), {
      kind: "lair", lairId: "l1", owners: false, followers: true,
    });
  });

  it("« all » demande les deux listes, pas l'une ou l'autre", () => {
    // Le `$match` fait figurer 'all' dans les deux branches de son `$or` :
    // l'écrire autrement priverait de push la moitié des destinataires d'une
    // annonce, sans que rien ne le signale.
    assert.deepEqual(describeAudience({ type: "lair", lairId: "l1", target: "all" }), {
      kind: "lair", lairId: "l1", owners: true, followers: true,
    });
    assert.deepEqual(describeAudience({ type: "event", eventId: "e1", target: "all" }), {
      kind: "event", eventId: "e1", participants: true, creator: true,
    });
  });

  it("un événement, selon la cible", () => {
    const event = { type: "event", eventId: "e1" } as const;

    assert.deepEqual(describeAudience({ ...event, target: "participants" }), {
      kind: "event", eventId: "e1", participants: true, creator: false,
    });
    assert.deepEqual(describeAudience({ ...event, target: "creator" }), {
      kind: "event", eventId: "e1", participants: false, creator: true,
    });
  });
});

describe("resolveAudience", () => {
  it("un utilisateur nommé est son propre destinataire", () => {
    assert.deepEqual(resolveAudience({ kind: "user", userId: "u1" }), ["u1"]);
  });

  it("ne retient que les listes demandées", () => {
    const loaded = { owners: ["owner"], followers: ["follower"] };

    assert.deepEqual(
      resolveAudience({ kind: "lair", lairId: "l1", owners: true, followers: false }, loaded),
      ["owner"]
    );
    assert.deepEqual(
      resolveAudience({ kind: "lair", lairId: "l1", owners: false, followers: true }, loaded),
      ["follower"]
    );
  });

  it("un propriétaire qui suit son lair n'est compté qu'une fois", () => {
    // Sinon son téléphone sonne deux fois pour un seul message.
    assert.deepEqual(
      resolveAudience(
        { kind: "lair", lairId: "l1", owners: true, followers: true },
        { owners: ["a", "b"], followers: ["b", "c"] }
      ),
      ["a", "b", "c"]
    );
  });

  it("un créateur inscrit à son propre événement n'est compté qu'une fois", () => {
    assert.deepEqual(
      resolveAudience(
        { kind: "event", eventId: "e1", participants: true, creator: true },
        { participants: ["a", "createur"], creatorId: "createur" }
      ),
      ["a", "createur"]
    );
  });

  it("écarte qui il faut écarter", () => {
    assert.deepEqual(
      resolveAudience(
        { kind: "event", eventId: "e1", participants: true, creator: true },
        { participants: ["a", "b"], creatorId: "c" },
        { exclude: ["b"] }
      ),
      ["a", "c"]
    );
  });

  it("une audience vide ne lève pas", () => {
    // Un lair sans propriétaire, un événement sans inscrit, un créateur absent :
    // trois situations réelles. Aucune ne doit casser l'action métier qui a
    // émis la notification.
    assert.deepEqual(resolveAudience({ kind: "lair", lairId: "l1", owners: true, followers: true }), []);
    assert.deepEqual(
      resolveAudience({ kind: "event", eventId: "e1", participants: true, creator: true }, { creatorId: null }),
      []
    );
  });
});
