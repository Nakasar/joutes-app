import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Db, MongoClient } from "mongodb";
import { createResilientDb } from "./mongodb-connection";

/**
 * Tests du client Mongo qui se relève d'une connexion initiale ratée. Ce qui
 * compte : un client sain n'est jamais remplacé, et une topologie fermée l'est
 * dès l'accès suivant — sans quoi la base reste coupée jusqu'au redémarrage.
 *
 * Exécution : `npm run test`.
 */

type FakeClient = MongoClient & {
  id: number;
  closed: boolean;
  closeTopology: () => void;
};

/** Fabrique de clients numérotés, dont on peut fermer la topologie à la main. */
function fakeClients(): { create: () => MongoClient; created: FakeClient[] } {
  const created: FakeClient[] = [];

  const create = () => {
    let onClosed: (() => void) | undefined;
    const db = { marker: `db-${created.length + 1}`, collection: (name: string) => name } as unknown as Db;
    const client = {
      id: created.length + 1,
      closed: false,
      on(event: string, listener: () => void) {
        if (event === "topologyClosed") onClosed = listener;
        return client;
      },
      db: () => db,
      close: async () => {
        client.closed = true;
      },
      closeTopology: () => onClosed?.(),
    } as unknown as FakeClient;
    created.push(client);
    return client as MongoClient;
  };

  return { create, created };
}

describe("createResilientDb", () => {
  it("ne crée le client qu'au premier accès", () => {
    const { create, created } = fakeClients();

    const db = createResilientDb(create);
    assert.equal(created.length, 0);

    db.collection("games");
    assert.equal(created.length, 1);
  });

  it("garde le même client tant que la topologie tient", () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    db.collection("games");
    db.collection("tournaments");
    db.collection("users");

    assert.equal(created.length, 1);
  });

  it("repart d'un client neuf après la fermeture de la topologie", () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    db.collection("games");
    // Ce que fait le driver quand la connexion initiale échoue : il ferme la
    // topologie sans lâcher le client, qui devient inutilisable à jamais.
    created[0].closeTopology();
    db.collection("games");

    assert.equal(created.length, 2);
    assert.equal(created[1].id, 2);
  });

  it("rend les ressources du client remplacé", async () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    db.collection("games");
    created[0].closeTopology();
    db.collection("games");
    await Promise.resolve();

    assert.equal(created[0].closed, true);
    assert.equal(created[1].closed, false);
  });

  it("ne remplace le client qu'une fois par fermeture", () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    db.collection("games");
    created[0].closeTopology();
    db.collection("games");
    db.collection("games");
    db.collection("games");

    assert.equal(created.length, 2);
  });

  it("ignore la fermeture d'un client déjà remplacé", () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    db.collection("games");
    created[0].closeTopology();
    db.collection("games");
    // Le client mort s'exprime encore : sa fermeture ne doit pas faire passer
    // son successeur, bien vivant, pour mort à son tour.
    created[0].closeTopology();
    db.collection("games");

    assert.equal(created.length, 2);
  });

  it("sert le Db du client courant, pas celui du client mort", () => {
    const { create, created } = fakeClients();
    const db = createResilientDb(create);

    const before = (db as unknown as { marker: string }).marker;
    created[0].closeTopology();
    const after = (db as unknown as { marker: string }).marker;

    assert.equal(before, "db-1");
    assert.equal(after, "db-2");
  });
});
