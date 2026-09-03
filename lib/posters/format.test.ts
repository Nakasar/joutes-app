import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";

import type { Event } from "@/lib/types/Event";
import { formatPrice, posterEvent, posterLabels, shortGameName } from "./format.ts";
import { posterRange } from "./period.ts";

const ZONE = "Europe/Paris";
const STRINGS = { free: "entrée libre", seats: (r: number, c: number) => `${r}/${c} places` };

describe("shortGameName", () => {
  it("garde le nom courant d'un jeu, sans son sous-titre ni sa gamme", () => {
    assert.equal(shortGameName("Magic: The Gathering"), "Magic");
    assert.equal(shortGameName("One Piece Card Game"), "One Piece");
    assert.equal(shortGameName("Star Wars Unlimited"), "Star Wars");
    assert.equal(shortGameName("Flesh and Blood"), "Flesh and Blood");
    assert.equal(shortGameName("Riftbound"), "Riftbound");
  });
});

describe("formatPrice", () => {
  it("écrit le prix en euros, l'entrée libre à zéro, rien sans prix", () => {
    assert.equal(formatPrice(undefined, "fr", STRINGS), undefined);
    assert.equal(formatPrice(0, "fr", STRINGS), "entrée libre");
    assert.equal(formatPrice(8, "fr", STRINGS)?.replace(/ /g, " "), "8 €");
    assert.equal(formatPrice(7.5, "fr", STRINGS)?.replace(/ /g, " "), "7,50 €");
  });
});

describe("posterEvent", () => {
  it("formate l'heure, la date courte, le jeu et la fréquentation", () => {
    const event: Event = {
      id: "e1",
      name: "Tournoi Nexus",
      gameName: "Riftbound",
      status: "available",
      addedBy: "USER",
      startDateTime: DateTime.fromISO("2026-09-09T19:30", { zone: ZONE }).toISO() ?? "",
      endDateTime: DateTime.fromISO("2026-09-09T23:00", { zone: ZONE }).toISO() ?? "",
      price: 10,
      maxParticipants: 24,
      registeredParticipantsCount: 14,
    };
    const games = { Riftbound: { color: "#c8842a", images: { icon: "https://example.test/riftbound.png" } } };

    const withLogos = posterEvent(event, "fr", ZONE, games, STRINGS, { logos: true, venues: false });
    assert.equal(withLogos.time, "19:30 – 23:00");
    assert.equal(withLogos.timeFr, "19h30 – 23h00");
    assert.equal(withLogos.dateShort, "mer. 9");
    assert.equal(withLogos.game.icon, "https://example.test/riftbound.png");
    assert.equal(withLogos.seats, "14/24 places");
    assert.equal(withLogos.full, false);

    const namesOnly = posterEvent(event, "fr", ZONE, games, STRINGS, { logos: false, venues: false });
    assert.equal(namesOnly.game.icon, undefined);
    assert.equal(namesOnly.game.color, "#c8842a");
  });

  it("n'écrit le lieu de l'événement que sur une affiche qui en réunit plusieurs", () => {
    const event: Event = {
      id: "evt-2",
      lairId: "lair-1",
      lair: { id: "lair-1", name: "La Taverne" },
      name: "Tournoi",
      gameName: "Riftbound",
      status: "available",
      addedBy: "USER",
      startDateTime: DateTime.fromISO("2026-09-09T19:30", { zone: ZONE }).toISO() ?? "",
      endDateTime: DateTime.fromISO("2026-09-09T23:00", { zone: ZONE }).toISO() ?? "",
    };

    assert.equal(posterEvent(event, "fr", ZONE, {}, STRINGS, { logos: true, venues: false }).venue, undefined);
    assert.equal(posterEvent(event, "fr", ZONE, {}, STRINGS, { logos: true, venues: true }).venue, "La Taverne");
  });
});

describe("posterLabels", () => {
  it("nomme la semaine et le mois en français", () => {
    const week = posterLabels(posterRange("week", DateTime.fromISO("2026-09-09", { zone: ZONE })), "fr");
    assert.equal(week.big, "7 – 13 septembre");
    assert.equal(week.year, "2026");
    assert.equal(week.isoWeek, 37);
    assert.equal(week.startNumeric, "07.09.2026");

    const month = posterLabels(posterRange("month", DateTime.fromISO("2026-09-09", { zone: ZONE })), "fr");
    assert.equal(month.big, "Septembre");
    assert.equal(month.long, "septembre 2026");
  });
});
