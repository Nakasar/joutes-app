import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DateTime } from "luxon";
import {
  extractHobbynextEvents,
  hobbynextDate,
  hobbynextResults,
  hobbynextSourceUrl,
  nextHobbynextPage,
  parseHobbynextEventRef,
  readHobbynextGames,
} from "./hobbynext-source";
import { eventSourceSchema } from "@/lib/schemas/lair.schema";

const PARIS = "Europe/Paris";
const NOW = DateTime.fromISO("2026-09-30T10:00", { zone: PARIS });

/**
 * Deux événements de l'Antre Temps (owner 1699), un événement importé de
 * Star Wars: Unlimited (Grenoble) et un événement « Light », tels que l'API
 * d'Asmodee les sert.
 */
const PAGE = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "__fixtures__", "hobbynext-events.json"), "utf-8"),
) as unknown;

const HOBBYNEXT_GAMES = readHobbynextGames([
  { id: 6, name: "Ticket to Ride Europe" },
  { id: 7, name: "Star Wars™: Unlimited" },
  { id: 11, name: "Other" },
  { id: 25, name: "Forest Shuffle" },
]);

const GAMES = [{ name: "Star Wars: Unlimited" }, { name: "Forêt Mixte" }, { name: "Mélodies" }];

const SOURCE = { url: hobbynextSourceUrl("1699"), gameAliases: { "Forest Shuffle": "Forêt Mixte" } };

function extract() {
  const items = hobbynextResults(PAGE);
  assert.ok(items);
  return extractHobbynextEvents({ items, source: SOURCE, games: GAMES, hobbynextGames: HOBBYNEXT_GAMES, now: NOW });
}

function paris(iso: string) {
  return DateTime.fromISO(iso).setZone(PARIS).toFormat("yyyy-MM-dd HH:mm");
}

describe("hobbynext", () => {
  it("lit l'heure d'un événement Hobbynext comme l'heure du lieu, malgré le Z", () => {
    const { events } = extract();
    const melodies = events.find((event) => event.externalId === "38425");
    assert.ok(melodies);
    assert.equal(paris(melodies.startDateTime), "2026-10-15 19:30");
    assert.equal(paris(melodies.endDateTime), "2026-10-16 00:00");
  });

  it("lit l'heure d'un événement importé comme un vrai UTC", () => {
    const { events } = extract();
    const grenoble = events.find((event) => event.externalId === "37193");
    assert.ok(grenoble);
    assert.equal(paris(grenoble.startDateTime), "2026-10-01 19:30");
    assert.equal(grenoble.gameName, "Star Wars: Unlimited");
  });

  it("nomme le jeu par la table d'Hobbynext et les alias, ou le cherche dans le titre pour « Other »", () => {
    const { events, warnings } = extract();
    assert.equal(events.find((event) => event.externalId === "38069")?.gameName, "Forêt Mixte");
    assert.equal(events.find((event) => event.externalId === "38425")?.gameName, "Mélodies");
    // Ticket to Ride Europe n'est pas sur la plateforme : écrit tel quel, et signalé.
    assert.equal(events.find((event) => event.externalId === "37691")?.gameName, "Ticket to Ride Europe");
    assert.ok(warnings.some((warning) => warning.includes("Ticket to Ride Europe")));
  });

  it("donne le lien public, l'identifiant, le prix et l'auteur", () => {
    const { events } = extract();
    const foret = events.find((event) => event.externalId === "38069");
    assert.ok(foret);
    assert.equal(foret.url, "https://event.hobbynext.com/fr/events/38069");
    assert.equal(foret.price, 5);
    assert.equal(foret.status, "available");
    assert.equal(foret.addedBy, "HOBBYNEXT");
    assert.equal(foret.sourceUrl, SOURCE.url);
  });

  it("écrit « Jeu non spécifié » pour « Other » quand le titre ne nomme aucun jeu", () => {
    const { events, warnings } = extractHobbynextEvents({
      items: [{ id: 1, name: "Soirée jeux", game: 11, event_type: "Full", event_start_date: "2026-10-15T19:30:00Z" }],
      source: SOURCE,
      games: GAMES,
      hobbynextGames: HOBBYNEXT_GAMES,
      now: NOW,
    });
    assert.equal(events[0].gameName, "Jeu non spécifié");
    assert.equal(warnings.length, 1);
  });

  it("ignore les événements qui ne sont pas publics", () => {
    const { events } = extractHobbynextEvents({
      items: [{ id: 1, name: "Privé", game: 7, event_type: "Full", event_start_date: "2026-10-15T19:30:00Z", event_visibility: "PRIVATE" }],
      source: SOURCE,
      games: GAMES,
      hobbynextGames: HOBBYNEXT_GAMES,
      now: NOW,
    });
    assert.equal(events.length, 0);
  });

  it("ôte le Z seulement hors des événements importés", () => {
    assert.equal(hobbynextDate("2026-10-15T19:30:00Z", "Full"), "2026-10-15T19:30:00");
    assert.equal(hobbynextDate("2026-10-15T19:30:00Z", "External"), "2026-10-15T19:30:00Z");
    assert.equal(hobbynextDate(null, "Full"), null);
  });

  it("reconnaît un lien d'événement ou son numéro", () => {
    assert.equal(parseHobbynextEventRef("https://event.hobbynext.com/fr/events/38425"), "38425");
    assert.equal(parseHobbynextEventRef("https://event.hobbynext.com/fr/events/38425/"), "38425");
    assert.equal(parseHobbynextEventRef(" 38425 "), "38425");
    assert.equal(parseHobbynextEventRef("https://event.hobbynext.com/fr/stores"), null);
    assert.equal(parseHobbynextEventRef("n'importe quoi"), null);
  });

  it("ne suit une page suivante que sur l'API d'Asmodee", () => {
    assert.equal(
      nextHobbynextPage({ next: "https://optool-api.asmodee.net/api/events/?owner=1699&page=2" }),
      "https://optool-api.asmodee.net/api/events/?owner=1699&page=2",
    );
    assert.equal(nextHobbynextPage({ next: "https://ailleurs.example/api" }), null);
    assert.equal(nextHobbynextPage({ next: null }), null);
  });

  it("valide une source dont l'URL suit l'identifiant, et refuse l'inverse", () => {
    assert.equal(
      eventSourceSchema.safeParse({ type: "HOBBYNEXT", url: hobbynextSourceUrl("1699"), hobbynextConfig: { ownerId: "1699" } }).success,
      true,
    );
    assert.equal(
      eventSourceSchema.safeParse({ type: "HOBBYNEXT", url: hobbynextSourceUrl("1"), hobbynextConfig: { ownerId: "1699" } }).success,
      false,
    );
    assert.equal(
      eventSourceSchema.safeParse({ type: "HOBBYNEXT", url: hobbynextSourceUrl("abc"), hobbynextConfig: { ownerId: "abc" } }).success,
      false,
    );
  });
});
