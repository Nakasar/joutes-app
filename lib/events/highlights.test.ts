import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Event, EventHighlights } from "@/lib/types/Event";

import {
  compareByHighlight,
  friendsOn,
  hasHighlight,
  highlightScore,
  isLairPick,
  isPopular,
  pickHighlights,
  registeredIds,
} from "./highlights.ts";

const ids = (n: number, prefix = "u") => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

function event(over: Partial<Event> = {}): Event {
  return {
    id: "e1",
    name: "Tournoi",
    startDateTime: "2026-11-07T13:30:00.000Z",
    endDateTime: "2026-11-07T19:00:00.000Z",
    gameName: "Riftbound",
    status: "available",
    addedBy: "USER",
    ...over,
  };
}

const none: EventHighlights = { popular: false, interest: 0, lairPick: false, friends: [] };

describe("isPopular", () => {
  it("compte inscrits et intéressés ensemble, à partir de douze", () => {
    assert.equal(isPopular(event({ participants: ids(8), favoritedBy: ids(3, "f") })), false);
    assert.equal(isPopular(event({ participants: ids(8), favoritedBy: ids(4, "f") })), true);
  });

  it("ne compte qu'une fois un intéressé déjà inscrit", () => {
    assert.equal(isPopular(event({ participants: ids(10), favoritedBy: ids(4) })), false);
  });

  it("ne compte pas les préinscrits ni les exclus", () => {
    const participants = ids(12);
    const participantRegistrations = Object.fromEntries(
      participants.slice(0, 3).map((id) => [id, "PRE_REGISTERED" as const]),
    );
    assert.deepEqual(registeredIds(event({ participants, participantRegistrations })).length, 9);
    assert.equal(isPopular(event({ participants, participantRegistrations })), false);
  });

  it("reconnaît une jauge remplie aux trois quarts, avec au moins six inscrits", () => {
    assert.equal(isPopular(event({ participants: ids(6), maxParticipants: 8 })), true);
    assert.equal(isPopular(event({ participants: ids(3), maxParticipants: 4 })), false);
    assert.equal(isPopular(event({ participants: ids(6), maxParticipants: 16 })), false);
  });

  it("reconnaît une liste d'attente ouverte", () => {
    assert.equal(isPopular(event({ waitlist: [{ userId: "w", joinedAt: "2026-10-01T00:00:00.000Z" }] })), true);
  });

  it("ne marque jamais un événement annulé", () => {
    assert.equal(isPopular(event({ status: "cancelled", participants: ids(30) })), false);
  });
});

describe("isLairPick", () => {
  it("demande un lieu et un événement maintenu", () => {
    assert.equal(isLairPick(event({ featured: true, lairId: "l1" })), true);
    assert.equal(isLairPick(event({ featured: true })), false);
    assert.equal(isLairPick(event({ featured: true, lairId: "l1", status: "cancelled" })), false);
  });
});

describe("friendsOn", () => {
  const friends = new Set(["ami1", "ami2", "ami3"]);

  it("liste les amis inscrits puis les amis intéressés", () => {
    const result = friendsOn(event({ participants: ["x", "ami2"], favoritedBy: ["ami1", "y"] }), "me", friends);
    assert.deepEqual(result, [
      { id: "ami2", kind: "registered" },
      { id: "ami1", kind: "interested" },
    ]);
  });

  it("ne révèle pas un inscrit quand la liste des inscrits est cachée", () => {
    const hidden = event({ participantsVisibility: "organizers", participants: ["ami1"], favoritedBy: ["ami1", "ami2"] });
    assert.deepEqual(friendsOn(hidden, "me", friends), [{ id: "ami2", kind: "interested" }]);
  });

  it("montre les inscrits à un inscrit quand la liste leur est réservée", () => {
    const reserved = event({ participantsVisibility: "participants", participants: ["ami1"] });
    assert.deepEqual(friendsOn(reserved, "me", friends), []);
    assert.deepEqual(friendsOn({ ...reserved, participants: ["ami1", "me"] }, "me", friends), [
      { id: "ami1", kind: "registered" },
    ]);
  });

  it("montre tout à l'organisation, propriétaires du lieu compris", () => {
    const hidden = event({ participantsVisibility: "organizers", participants: ["ami1"] });
    assert.deepEqual(friendsOn(hidden, "me", friends, ["me"]), [{ id: "ami1", kind: "registered" }]);
  });

  it("ne compte pas un ami préinscrit comme inscrit", () => {
    const pre = event({ participants: ["ami1"], participantRegistrations: { ami1: "PRE_REGISTERED" } });
    assert.deepEqual(friendsOn(pre, "me", friends), []);
  });
});

describe("le classement", () => {
  const withMarks = (id: string, start: string, highlights: EventHighlights, over: Partial<Event> = {}) =>
    event({ id, startDateTime: start, highlights, ...over });
  const friend = { id: "a", displayName: "Léa", kind: "registered" as const };

  it("pèse les amis, puis le choix du lieu, puis la popularité", () => {
    assert.equal(highlightScore({ ...none, friends: [friend] }), 4);
    assert.equal(highlightScore({ ...none, lairPick: true, popular: true }), 3);
    assert.equal(highlightScore(undefined), 0);
    assert.equal(hasHighlight(none), false);
  });

  it("trie une journée par marques puis par heure", () => {
    const plain = withMarks("plain", "2026-11-07T10:00:00.000Z", none);
    const pick = withMarks("pick", "2026-11-07T18:00:00.000Z", { ...none, lairPick: true });
    const early = withMarks("early", "2026-11-07T09:00:00.000Z", none);
    assert.deepEqual([plain, pick, early].sort(compareByHighlight).map((e) => e.id), ["pick", "early", "plain"]);
  });

  it("choisit trois événements marqués, sans ceux où je suis inscrit ni les doublons", () => {
    const events = [
      withMarks("pop", "2026-11-01T10:00:00.000Z", { ...none, popular: true }),
      withMarks("mine", "2026-11-02T10:00:00.000Z", { ...none, friends: [friend] }, { participants: ["me"] }),
      withMarks("rien", "2026-11-03T10:00:00.000Z", none),
      withMarks("ami", "2026-11-09T10:00:00.000Z", { ...none, friends: [friend] }),
      withMarks("lieu", "2026-11-05T10:00:00.000Z", { ...none, lairPick: true }),
      withMarks("lieu", "2026-11-05T10:00:00.000Z", { ...none, lairPick: true }),
      withMarks("pop2", "2026-11-04T10:00:00.000Z", { ...none, popular: true }),
    ];
    assert.deepEqual(pickHighlights(events, "me").map((e) => e.id), ["ami", "lieu", "pop"]);
  });
});
