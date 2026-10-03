import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db, Document } from "mongodb";
import { ensureIndexes, undeclaredIndexes, type IndexDefinition } from "./ensure";

/**
 * Tests de la pose des index. Ce qui compte : rejouer ne crée rien, un index
 * posé sous un autre nom est reconnu, rien n'est jamais supprimé, et un échec
 * n'arrête pas les suivants.
 *
 * Exécution : `npm run test`.
 */

type FakeCollection = { indexes: Document[]; failWith?: Error };

/** Une base en mémoire qui ne connaît que `listIndexes` et `createIndex`. */
function fakeDb(collections: Record<string, FakeCollection>) {
  const created: { collection: string; keys: Document; options: Document }[] = [];

  const db = {
    collection(name: string) {
      return {
        listIndexes() {
          return {
            async toArray() {
              const collection = collections[name];
              if (!collection) throw Object.assign(new Error("ns does not exist"), { code: 26 });
              return collection.indexes;
            },
          };
        },
        async createIndex(keys: Document, options: Document) {
          const collection = (collections[name] ??= { indexes: [{ key: { _id: 1 }, name: "_id_" }] });
          if (collection.failWith) throw collection.failWith;
          const indexName =
            options.name ??
            Object.entries(keys)
              .map(([field, direction]) => `${field}_${direction}`)
              .join("_");
          collection.indexes.push({ key: keys, name: indexName, ...options });
          created.push({ collection: name, keys, options });
          return indexName;
        },
      };
    },
  } as unknown as Db;

  return { db, created };
}

const byLairAndDate: IndexDefinition = {
  collection: "events",
  keys: { lairId: 1, startDateTime: 1 },
  why: "l'agenda d'un lieu",
};

describe("ensureIndexes", () => {
  it("crée un index absent, y compris sur une collection qui n'existe pas encore", async () => {
    const { db, created } = fakeDb({});

    const outcomes = await ensureIndexes(db, [byLairAndDate]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["created"]
    );
    assert.equal(created.length, 1);
  });

  it("ne recrée rien à la deuxième passe", async () => {
    const { db, created } = fakeDb({});

    await ensureIndexes(db, [byLairAndDate]);
    const second = await ensureIndexes(db, [byLairAndDate]);

    assert.deepEqual(
      second.map((outcome) => outcome.status),
      ["present"]
    );
    assert.equal(created.length, 1);
  });

  it("reconnaît un index posé sous un autre nom", async () => {
    const { db, created } = fakeDb({
      events: { indexes: [{ key: { lairId: 1, startDateTime: 1 }, name: "agenda_du_lieu" }] },
    });

    const [outcome] = await ensureIndexes(db, [byLairAndDate]);

    assert.equal(outcome.status, "present");
    assert.equal(created.length, 0);
  });

  it("distingue l'ordre des champs", async () => {
    const { db, created } = fakeDb({
      events: { indexes: [{ key: { startDateTime: 1, lairId: 1 }, name: "startDateTime_1_lairId_1" }] },
    });

    const [outcome] = await ensureIndexes(db, [byLairAndDate]);

    assert.equal(outcome.status, "created");
    assert.equal(created.length, 1);
  });

  it("signale sans y toucher un index de mêmes clés mais d'autres options", async () => {
    const { db, created } = fakeDb({
      user: { indexes: [{ key: { friendCode: 1 }, name: "friendCode_1" }] },
    });

    const [outcome] = await ensureIndexes(db, [
      { collection: "user", keys: { friendCode: 1 }, options: { unique: true, sparse: true }, why: "code ami" },
    ]);

    assert.equal(outcome.status, "conflict");
    assert.equal(created.length, 0);
  });

  it("tient `unique: false` pour l'absence d'option", async () => {
    const { db } = fakeDb({
      events: { indexes: [{ key: { lairId: 1, startDateTime: 1 }, name: "x", unique: false }] },
    });

    const [outcome] = await ensureIndexes(db, [byLairAndDate]);

    assert.equal(outcome.status, "present");
  });

  it("poursuit après un échec", async () => {
    const { db, created } = fakeDb({
      matches: { indexes: [], failWith: new Error("E11000 duplicate key") },
    });

    const outcomes = await ensureIndexes(db, [
      { collection: "matches", keys: { id: 1 }, options: { unique: true }, why: "identifiant" },
      byLairAndDate,
    ]);

    assert.deepEqual(
      outcomes.map((outcome) => outcome.status),
      ["failed", "created"]
    );
    assert.equal(created.length, 1);
  });

  it("n'écrit rien à blanc", async () => {
    const { db, created } = fakeDb({});

    const [outcome] = await ensureIndexes(db, [byLairAndDate], { dryRun: true });

    assert.equal(outcome.status, "created");
    assert.equal(created.length, 0);
  });
});

describe("undeclaredIndexes", () => {
  it("liste ce que la base porte en plus du registre, sans `_id_`", async () => {
    const { db } = fakeDb({
      events: {
        indexes: [
          { key: { _id: 1 }, name: "_id_" },
          { key: { lairId: 1, startDateTime: 1 }, name: "lairId_1_startDateTime_1" },
          { key: { name: 1 }, name: "name_1" },
        ],
      },
    });

    const undeclared = await undeclaredIndexes(db, [byLairAndDate]);

    assert.deepEqual(
      undeclared.map(({ collection, name }) => `${collection}.${name}`),
      ["events.name_1"]
    );
  });
});

describe("collations", () => {
  it("reconnaît une collation restituée avec toutes ses valeurs par défaut", async () => {
    const { db, created } = fakeDb({
      user: {
        indexes: [
          {
            key: { displayName: 1, discriminator: 1 },
            name: "displayName_1_discriminator_1",
            collation: { locale: "en", caseLevel: false, caseFirst: "off", strength: 2, numericOrdering: false },
          },
        ],
      },
    });

    const [outcome] = await ensureIndexes(db, [
      {
        collection: "user",
        keys: { displayName: 1, discriminator: 1 },
        options: { collation: { locale: "en", strength: 2 } },
        why: "tag",
      },
    ]);

    assert.equal(outcome.status, "present");
    assert.equal(created.length, 0);
  });
});
