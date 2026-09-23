import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { WaitlistEntry } from "@/lib/types/Event";
import {
  DEFAULT_WAITLIST_RESPONSE_HOURS,
  canJoinDirectly,
  freeSeats,
  isWaitlistOver,
  offerDeadline,
  orderParticipants,
  planWaitlist,
  viewerWaitlistStatus,
  type WaitlistEventState,
} from "./waitlist";

const NOW = new Date("2026-09-23T10:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function iso(offsetHours: number): string {
  return new Date(NOW.getTime() + offsetHours * HOUR).toISOString();
}

function event(overrides: Partial<WaitlistEventState> = {}): WaitlistEventState {
  return {
    maxParticipants: 4,
    registeredParticipantsCount: 4,
    waitlist: [],
    startDateTime: iso(24 * 8),
    status: "sold-out",
    runningState: "not-started",
    allowJoin: true,
    ...overrides,
  };
}

const waiting = (userId: string, joinedHoursAgo: number): WaitlistEntry => ({
  userId,
  joinedAt: iso(-joinedHoursAgo),
});

describe("places libres", () => {
  it("compte les offres en cours comme des places prises", () => {
    const e = event({
      registeredParticipantsCount: 3,
      waitlist: [{ ...waiting("a", 5), offeredAt: iso(-1), offerExpiresAt: iso(10) }],
    });
    assert.equal(freeSeats(e, NOW), 0);
  });

  it("ne compte plus une offre échue", () => {
    const e = event({
      registeredParticipantsCount: 3,
      waitlist: [{ ...waiting("a", 5), offeredAt: iso(-50), offerExpiresAt: iso(-2) }],
    });
    assert.equal(freeSeats(e, NOW), 1);
  });

  it("est illimité sans maximum", () => {
    assert.equal(freeSeats(event({ maxParticipants: undefined }), NOW), Infinity);
  });
});

describe("inscription directe", () => {
  it("est possible tant qu'il reste une place et que personne n'attend", () => {
    assert.equal(canJoinDirectly(event({ registeredParticipantsCount: 3 }), NOW), true);
  });

  it("passe par la file quand l'événement est complet", () => {
    assert.equal(canJoinDirectly(event(), NOW), false);
  });

  it("passe par la file quand des joueurs attendent déjà, même avec une place libre", () => {
    const e = event({ registeredParticipantsCount: 3, waitlist: [waiting("a", 2)] });
    assert.equal(canJoinDirectly(e, NOW), false);
  });

  it("reste toujours possible sans maximum", () => {
    assert.equal(canJoinDirectly(event({ maxParticipants: undefined }), NOW), true);
  });
});

describe("échéance d'une offre", () => {
  it("vaut 48 h par défaut", () => {
    assert.equal(DEFAULT_WAITLIST_RESPONSE_HOURS, 48);
    assert.equal(offerDeadline(event(), NOW).toISOString(), iso(48));
  });

  it("suit le délai choisi par l'organisation", () => {
    assert.equal(offerDeadline(event({ waitlistResponseHours: 12 }), NOW).toISOString(), iso(12));
  });

  it("est raccourcie au début de l'événement", () => {
    assert.equal(offerDeadline(event({ startDateTime: iso(5) }), NOW).toISOString(), iso(5));
  });
});

describe("plan de la file", () => {
  it("offre la place libérée au premier arrivé", () => {
    const e = event({
      registeredParticipantsCount: 3,
      waitlist: [waiting("second", 2), waiting("first", 10), waiting("third", 1)],
    });
    const plan = planWaitlist(e, NOW);
    assert.deepEqual(plan.offers.map((entry) => entry.userId), ["first"]);
    assert.deepEqual(plan.expired, []);
  });

  it("offre autant de places qu'il s'en libère", () => {
    const e = event({
      maxParticipants: 6,
      registeredParticipantsCount: 4,
      waitlist: [waiting("a", 3), waiting("b", 2), waiting("c", 1)],
    });
    assert.deepEqual(planWaitlist(e, NOW).offers.map((entry) => entry.userId), ["a", "b"]);
  });

  it("n'offre pas une place déjà réservée à quelqu'un", () => {
    const e = event({
      registeredParticipantsCount: 3,
      waitlist: [
        { ...waiting("a", 3), offeredAt: iso(-1), offerExpiresAt: iso(20) },
        waiting("b", 2),
      ],
    });
    assert.deepEqual(planWaitlist(e, NOW).offers, []);
  });

  it("sort une offre échue et passe la place au suivant", () => {
    const e = event({
      registeredParticipantsCount: 3,
      waitlist: [
        { ...waiting("a", 60), offeredAt: iso(-49), offerExpiresAt: iso(-1) },
        waiting("b", 2),
      ],
    });
    const plan = planWaitlist(e, NOW);
    assert.deepEqual(plan.expired.map((entry) => entry.userId), ["a"]);
    assert.deepEqual(plan.offers.map((entry) => entry.userId), ["b"]);
  });

  it("ne fait aucune offre quand l'événement est commencé, annulé ou fermé", () => {
    const base = { registeredParticipantsCount: 3, waitlist: [waiting("a", 2)] };
    assert.deepEqual(planWaitlist(event({ ...base, runningState: "ongoing" }), NOW).offers, []);
    assert.deepEqual(planWaitlist(event({ ...base, status: "cancelled" }), NOW).offers, []);
    assert.deepEqual(planWaitlist(event({ ...base, allowJoin: false }), NOW).offers, []);
    assert.deepEqual(planWaitlist(event({ ...base, startDateTime: iso(-1) }), NOW).offers, []);
  });
});

describe("position d'un joueur", () => {
  const e = event({
    waitlist: [
      waiting("b", 2),
      { ...waiting("a", 10), offeredAt: iso(-1), offerExpiresAt: iso(47) },
      waiting("c", 1),
    ],
  });

  it("donne le rang et l'offre en cours", () => {
    assert.deepEqual(viewerWaitlistStatus(e, "a", NOW), {
      position: 1,
      total: 3,
      joinedAt: iso(-10),
      offer: { offeredAt: iso(-1), expiresAt: iso(47) },
    });
    assert.equal(viewerWaitlistStatus(e, "c", NOW)?.position, 3);
    assert.equal(viewerWaitlistStatus(e, "c", NOW)?.offer, undefined);
  });

  it("vaut null hors de la file", () => {
    assert.equal(viewerWaitlistStatus(e, "z", NOW), null);
  });
});

describe("ordre des inscrits", () => {
  it("trie par date d'inscription, les inscriptions sans date en tête", () => {
    const order = orderParticipants(["late", "legacy1", "early", "legacy2"], {
      late: iso(-1),
      early: iso(-10),
    });
    assert.deepEqual(order, ["legacy1", "legacy2", "early", "late"]);
  });
});

describe("fin de la file", () => {
  it("offre une place à tous ceux qui attendent quand le maximum est retiré", () => {
    const e = event({ maxParticipants: undefined, waitlist: [waiting("a", 2), waiting("b", 1)] });
    assert.deepEqual(planWaitlist(e, NOW).offers.map((entry) => entry.userId), ["a", "b"]);
  });

  it("est close pour de bon une fois l'événement annulé, commencé ou passé", () => {
    assert.equal(isWaitlistOver(event(), NOW), false);
    assert.equal(isWaitlistOver(event({ allowJoin: false }), NOW), false);
    assert.equal(isWaitlistOver(event({ status: "cancelled" }), NOW), true);
    assert.equal(isWaitlistOver(event({ runningState: "completed" }), NOW), true);
    assert.equal(isWaitlistOver(event({ startDateTime: iso(-1) }), NOW), true);
  });
});
