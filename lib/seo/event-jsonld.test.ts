import assert from "node:assert/strict";
import { test } from "node:test";

import type { Event } from "@/lib/types/Event";

import { eventJsonLd, isUnlistedEvent, jsonLdScript } from "./event-jsonld.ts";

/** La forme lue par ces tests, sans typer tout schema.org. */
type Described = {
  "@type": string;
  url: string;
  eventStatus: string;
  location: { name: string; geo: unknown };
  offers: { price: number; availability: string };
};

const base = {
  id: "ev1",
  lairId: "l1",
  name: "Tournoi du samedi",
  startDateTime: "2026-12-05T13:00:00.000Z",
  endDateTime: "2026-12-05T18:00:00.000Z",
  gameName: "Riftbound",
  status: "available",
  addedBy: "USER",
  lair: { id: "l1", name: "L'Antre", address: "1 rue du Jeu, Lyon", location: { type: "Point", coordinates: [4.83, 45.76] } },
} as unknown as Event;

test("un événement de boutique est décrit avec son lieu et son prix", () => {
  const data = eventJsonLd({ ...base, price: 5 }, "/events/ev1") as Described;
  assert.equal(data["@type"], "Event");
  assert.equal(data.url, "https://www.joutes.app/events/ev1");
  assert.equal(data.location.name, "L'Antre");
  assert.deepEqual(data.location.geo, { "@type": "GeoCoordinates", longitude: 4.83, latitude: 45.76 });
  assert.equal(data.offers.price, 5);
  assert.equal(data.eventStatus, "https://schema.org/EventScheduled");
});

test("annulé et complet se disent", () => {
  assert.equal(
    (eventJsonLd({ ...base, status: "cancelled" }, "/events/ev1") as Described).eventStatus,
    "https://schema.org/EventCancelled",
  );
  assert.equal(
    (eventJsonLd({ ...base, status: "sold-out", price: 0 }, "/events/ev1") as Described).offers.availability,
    "https://schema.org/SoldOut",
  );
});

test("un événement privé (sans lieu) n'est pas décrit", () => {
  assert.equal(eventJsonLd({ ...base, lairId: undefined, lair: undefined } as unknown as Event, "/events/ev1"), null);
});

test("le script ne peut pas être fermé par un nom d'événement", () => {
  assert.ok(!jsonLdScript({ name: "</script><script>alert(1)" }).includes("<"));
});

test("un événement d'un lieu privé, ou sans lieu, n'est pas décrit aux moteurs", () => {
  const privateLair = { ...base, lair: { ...base.lair, isPrivate: true } } as Event;
  assert.equal(isUnlistedEvent(privateLair), true);
  assert.equal(eventJsonLd(privateLair, "/events/ev1"), null);
  assert.equal(isUnlistedEvent({ ...base, lairId: undefined, lair: undefined } as unknown as Event), true);
  assert.equal(isUnlistedEvent(base), false);
});
