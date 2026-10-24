import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canSeeAttendees, initials, pageAttendees, readParticipantsVisibility, searchKey } from "./attendees.ts";

const names = Array.from({ length: 25 }, (_, i) => `Joueur ${i + 1}`);
const text = (name: string) => [name];

describe("canSeeAttendees", () => {
  it("ouvre la liste à tous par défaut", () => {
    assert.equal(canSeeAttendees(undefined, { isManager: false, isParticipant: false }), true);
  });

  it("réserve la liste aux inscrits quand on le demande", () => {
    assert.equal(canSeeAttendees("participants", { isManager: false, isParticipant: false }), false);
    assert.equal(canSeeAttendees("participants", { isManager: false, isParticipant: true }), true);
  });

  it("laisse toujours la liste à l'organisation", () => {
    assert.equal(canSeeAttendees("organizers", { isManager: false, isParticipant: true }), false);
    assert.equal(canSeeAttendees("organizers", { isManager: true, isParticipant: false }), true);
  });
});

describe("readParticipantsVisibility", () => {
  it("ramène une valeur inconnue à public", () => {
    assert.equal(readParticipantsVisibility("tout-le-monde"), "public");
    assert.equal(readParticipantsVisibility("organizers"), "organizers");
  });
});

describe("pageAttendees", () => {
  it("découpe des pages", () => {
    const result = pageAttendees(names, { page: 1, pageSize: 10, text });
    assert.equal(result.total, 25);
    assert.equal(result.pageCount, 3);
    assert.deepEqual(result.items, names.slice(10, 20));
  });

  it("ramène une page hors bornes à la dernière", () => {
    const result = pageAttendees(names, { page: 9, pageSize: 10, text });
    assert.equal(result.page, 2);
    assert.deepEqual(result.items, names.slice(20));
  });

  it("cherche sans tenir compte des accents ni de la casse", () => {
    const result = pageAttendees(["Élodie", "Lyra", "Mélusine"], { query: "ELO", text });
    assert.deepEqual(result.items, ["Élodie"]);
    assert.equal(searchKey(" Mél "), "mel");
  });

  it("garde une page même sans résultat", () => {
    const result = pageAttendees(names, { query: "zzz", text });
    assert.equal(result.total, 0);
    assert.equal(result.pageCount, 1);
    assert.equal(result.page, 0);
  });
});

describe("initials", () => {
  it("ignore la ponctuation et garde lettres et chiffres", () => {
    assert.equal(initials("L'Ours"), "LO");
    assert.equal(initials("Nakasar#6666"), "Na");
    assert.equal(initials("--"), "");
    assert.equal(initials("Élodie"), "Él");
  });
});
