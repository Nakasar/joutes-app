import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DateTime } from "luxon";
import {
  getNestedValue,
  normalizeEventName,
  normalizeEventPrice,
  normalizeEventStatus,
  parseSourceDate,
  readEventsCollection,
  reconcileSourceEvents,
  resolveEventDates,
  resolveEventUrl,
  resolveEventYear,
} from "./source-events";
import type { SourceEvent, StoredEvent } from "./source-events";

const PARIS = "Europe/Paris";
const SOURCE = "https://boutique.example/agenda";
const OTHER_SOURCE = "https://boutique.example/agenda.json";

// Un mardi de septembre.
const NOW = DateTime.fromISO("2026-09-01T10:00", { zone: PARIS });

function incoming(overrides: Partial<SourceEvent> = {}): SourceEvent {
  return {
    name: "Soirée Riftbound",
    startDateTime: "2026-09-08T19:00:00.000+02:00",
    endDateTime: "2026-09-08T23:00:00.000+02:00",
    gameName: "Riftbound",
    status: "available",
    addedBy: "AI-SCRAPPING",
    sourceUrl: SOURCE,
    ...overrides,
  };
}

function stored(overrides: Partial<StoredEvent> = {}): StoredEvent {
  return {
    id: "evt-1",
    name: "Soirée Riftbound",
    startDateTime: "2026-09-08T19:00:00.000+02:00",
    endDateTime: "2026-09-08T23:00:00.000+02:00",
    gameName: "Riftbound",
    status: "available",
    addedBy: "AI-SCRAPPING",
    source: { url: SOURCE },
    ...overrides,
  };
}

describe("lecture d'une date de source", () => {
  it("lit l'ISO, le SQL et un horodatage", () => {
    assert.equal(parseSourceDate("2026-03-15T20:00:00+01:00")?.toISO(), "2026-03-15T20:00:00.000+01:00");
    assert.equal(parseSourceDate("2026-03-15 20:00:00")?.toISO(), "2026-03-15T20:00:00.000+01:00");
    assert.equal(parseSourceDate(1773601200)?.toUTC().toISO(), "2026-03-15T19:00:00.000Z");
    assert.equal(parseSourceDate("1773601200000")?.toUTC().toISO(), "2026-03-15T19:00:00.000Z");
    assert.equal(parseSourceDate("15/03/2026 20:00")?.toISO(), "2026-03-15T20:00:00.000+01:00");
  });

  it("rend null pour ce qui n'est pas une date", () => {
    assert.equal(parseSourceDate("bientôt"), null);
    assert.equal(parseSourceDate(""), null);
    assert.equal(parseSourceDate(null), null);
    assert.equal(parseSourceDate({}), null);
  });
});

describe("année d'une date sans année", () => {
  it("place le 15 janvier vu de décembre dans l'année suivante", () => {
    const december = DateTime.fromISO("2026-12-10T10:00", { zone: PARIS });
    const guessed = DateTime.fromISO("2026-01-15T20:00", { zone: PARIS });
    assert.equal(resolveEventYear(guessed, december, { trustYear: false }).year, 2027);
  });

  it("place le 20 décembre vu de janvier dans l'année précédente", () => {
    const january = DateTime.fromISO("2027-01-05T10:00", { zone: PARIS });
    const guessed = DateTime.fromISO("2027-12-20T20:00", { zone: PARIS });
    assert.equal(resolveEventYear(guessed, january, { trustYear: false }).year, 2026);
  });

  it("corrige une année inventée par le modèle", () => {
    const guessed = DateTime.fromISO("2024-09-08T19:00", { zone: PARIS });
    assert.equal(resolveEventYear(guessed, NOW, { trustYear: false }).year, 2026);
  });

  it("garde l'année d'une source qui la donne, même loin devant", () => {
    // L'ancien code forçait l'année en cours : un tournoi de janvier 2027 lu
    // en septembre 2026 partait en janvier 2026, dans le passé.
    const given = DateTime.fromISO("2027-01-15T10:00", { zone: PARIS });
    assert.equal(resolveEventYear(given, NOW, { trustYear: true }).year, 2027);
  });

  it("ne croit pas une année absurde même d'une source de confiance", () => {
    const given = DateTime.fromISO("2019-09-08T19:00", { zone: PARIS });
    assert.equal(resolveEventYear(given, NOW, { trustYear: true }).year, 2026);
  });
});

describe("bornes d'un événement", () => {
  it("rend null sans début lisible", () => {
    assert.equal(resolveEventDates({ start: "?", end: "2026-09-08T23:00", now: NOW, trustYear: true }), null);
  });

  it("prête quatre heures à un événement sans fin", () => {
    const dates = resolveEventDates({ start: "2026-09-08T19:00", end: null, now: NOW, trustYear: true });
    assert.equal(dates?.endDateTime, "2026-09-08T23:00:00.000+02:00");
  });

  it("lit « 20 h — 1 h » comme finissant le lendemain", () => {
    const dates = resolveEventDates({ start: "2026-09-08T20:00", end: "2026-09-08T01:00", now: NOW, trustYear: true });
    assert.equal(dates?.endDateTime, "2026-09-09T01:00:00.000+02:00");
  });

  it("écrit en heure de Paris", () => {
    const dates = resolveEventDates({ start: "2026-09-08T17:00:00Z", end: null, now: NOW, trustYear: true });
    assert.equal(dates?.startDateTime, "2026-09-08T19:00:00.000+02:00");
  });
});

describe("champs d'une source", () => {
  it("reconnaît les statuts sous leurs différents noms", () => {
    assert.equal(normalizeEventStatus("Complet"), "sold-out");
    assert.equal(normalizeEventStatus("canceled"), "cancelled");
    assert.equal(normalizeEventStatus("Annulé"), "cancelled");
    assert.equal(normalizeEventStatus("open"), "available");
    assert.equal(normalizeEventStatus(true), "available");
    assert.equal(normalizeEventStatus("bizarre"), null);
  });

  it("lit un prix écrit de plusieurs façons", () => {
    assert.equal(normalizeEventPrice(12), 12);
    assert.equal(normalizeEventPrice("12,50 €"), 12.5);
    assert.equal(normalizeEventPrice("Gratuit"), 0);
    assert.equal(normalizeEventPrice("sur place"), undefined);
    assert.equal(normalizeEventPrice(-3), undefined);
  });

  it("résout un lien relatif contre la page source", () => {
    assert.equal(resolveEventUrl("/details/123", "https://my-site.com/events"), "https://my-site.com/details/123");
    assert.equal(resolveEventUrl("https://other.com/x", "https://my-site.com/events"), "https://other.com/x");
    assert.equal(resolveEventUrl("javascript:alert(1)", "https://my-site.com/events"), undefined);
    assert.equal(resolveEventUrl("", "https://my-site.com/events"), undefined);
  });

  it("compare les noms sans casse, accent ni ponctuation", () => {
    assert.equal(normalizeEventName("Soirée Riftbound !"), normalizeEventName("soiree   riftbound"));
    assert.notEqual(normalizeEventName("Soirée Riftbound"), normalizeEventName("Tournoi Riftbound"));
  });
});

describe("lecture d'un JSON", () => {
  const data = { data: { events: [{ id: 1, when: { start: "x" } }, { id: 2 }] }, byId: { a: { id: "a" }, b: { id: "b" } } };

  it("suit un chemin avec index", () => {
    assert.equal(getNestedValue(data, "data.events[0].when.start"), "x");
    assert.equal(getNestedValue(data, "data.events.1.id"), 2);
    assert.equal(getNestedValue(data, "data.nope.x"), undefined);
  });

  it("désigne la racine par un chemin vide ou $", () => {
    assert.equal(getNestedValue(data, ""), data);
    assert.equal(getNestedValue(data, "$"), data);
    assert.equal(getNestedValue(data, "$.data.events[1].id"), 2);
  });

  it("lit un tableau ou un objet indexé par identifiant", () => {
    assert.equal(readEventsCollection(data, "data.events")?.length, 2);
    assert.equal(readEventsCollection(data, "byId")?.length, 2);
    assert.equal(readEventsCollection(data, "data.events[0].id"), null);
    assert.equal(readEventsCollection([{ id: 1 }], "$")?.length, 1);
  });
});

describe("rapprochement — ce que le rafraîchissement doit garder", () => {
  it("met à jour en place un événement retrouvé par son URL, favoris compris", () => {
    // Le bogue d'origine : l'événement retrouvé n'était pas noté comme tel,
    // puis supprimé par le grand nettoyage — et recréé au tour suivant, sans
    // ses favoris.
    const existing = stored({ url: "https://boutique.example/e/1", favoritedBy: ["u1"], status: "available" });
    const event = incoming({ url: "https://boutique.example/e/1", status: "sold-out" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [existing], now: NOW });

    assert.equal(verdict.toInsert.length, 0);
    assert.equal(verdict.toDelete.length, 0);
    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].existing.id, "evt-1");
    assert.equal(verdict.toUpdate[0].patch.status, "sold-out");
  });

  it("retrouve un événement sans URL par son nom et son jour", () => {
    const existing = stored({ name: "Soirée Riftbound", startDateTime: "2026-09-08T19:30:00.000+02:00" });
    const event = incoming({ name: "soiree riftbound", startDateTime: "2026-09-08T19:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [existing], now: NOW });

    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].patch.startDateTime, "2026-09-08T19:00:00.000+02:00");
    assert.equal(verdict.toInsert.length, 0);
  });

  it("ne touche à rien quand tout est identique", () => {
    const verdict = reconcileSourceEvents({ incoming: [incoming()], existing: [stored()], now: NOW });

    assert.equal(verdict.unchanged.length, 1);
    assert.equal(verdict.toUpdate.length, 0);
  });

  it("préfère l'identifiant de la source à tout le reste", () => {
    const renamedAndMoved = stored({
      id: "evt-json",
      name: "Ancien nom",
      startDateTime: "2026-09-10T19:00:00.000+02:00",
      endDateTime: "2026-09-10T23:00:00.000+02:00",
      addedBy: "JSON-MAPPING",
      source: { url: OTHER_SOURCE, externalId: "42" },
    });
    const event = incoming({ addedBy: "JSON-MAPPING", sourceUrl: OTHER_SOURCE, externalId: "42", name: "Nouveau nom" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [renamedAndMoved], now: NOW });

    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].existing.id, "evt-json");
    assert.equal(verdict.toUpdate[0].patch.name, "Nouveau nom");
  });

  it("ne mélange pas les jours d'un lien partagé par plusieurs dates", () => {
    const url = "https://boutique.example/soirees-riftbound";
    const tuesday = stored({ id: "tue", url, startDateTime: "2026-09-08T19:00:00.000+02:00", favoritedBy: ["u1"] });
    const thursday = stored({ id: "thu", url, startDateTime: "2026-09-10T19:00:00.000+02:00", endDateTime: "2026-09-10T23:00:00.000+02:00" });
    const events = [
      incoming({ url, startDateTime: "2026-09-10T19:00:00.000+02:00", endDateTime: "2026-09-10T23:00:00.000+02:00" }),
      incoming({ url, startDateTime: "2026-09-08T19:00:00.000+02:00" }),
    ];

    const verdict = reconcileSourceEvents({ incoming: events, existing: [tuesday, thursday], now: NOW });

    assert.equal(verdict.unchanged.length, 2);
    assert.equal(verdict.toInsert.length, 0);
    assert.equal(verdict.toDelete.length, 0);
  });

  it("suit un événement dont la date a bougé, par son lien", () => {
    const url = "https://boutique.example/e/7";
    const existing = stored({ url, favoritedBy: ["u1"] });
    const event = incoming({ url, startDateTime: "2026-09-15T19:00:00.000+02:00", endDateTime: "2026-09-15T23:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [existing], now: NOW });

    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].existing.id, "evt-1");
    assert.equal(verdict.toInsert.length, 0);
  });

  it("ne déplace pas une soirée passée sur une date nouvelle par leur lien partagé", () => {
    const url = "https://boutique.example/soirees-riftbound";
    const lastWeek = stored({ id: "past", url, startDateTime: "2026-08-25T19:00:00.000+02:00", endDateTime: "2026-08-25T23:00:00.000+02:00", participants: ["u1"] });
    const event = incoming({ url, startDateTime: "2026-09-12T19:00:00.000+02:00", endDateTime: "2026-09-12T23:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [lastWeek], now: NOW });

    assert.equal(verdict.toUpdate.length, 0);
    assert.equal(verdict.toInsert.length, 1);
  });

  it("suit un événement renommé sur le même créneau du même jeu", () => {
    const existing = stored({ name: "Casual", favoritedBy: ["u1"] });
    const event = incoming({ name: "Casual Night" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [existing], now: NOW });

    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].patch.name, "Casual Night");
  });

  it("insère ce qu'il ne connaît pas", () => {
    const verdict = reconcileSourceEvents({
      incoming: [incoming({ name: "Draft du mois", startDateTime: "2026-09-20T14:00:00.000+02:00" })],
      existing: [stored()],
      now: NOW,
    });

    assert.equal(verdict.toInsert.length, 1);
  });

  it("ignore les événements saisis à la main, sans jamais les rapprocher", () => {
    const manual = stored({ id: "manual", addedBy: "USER", source: undefined });

    const verdict = reconcileSourceEvents({ incoming: [incoming()], existing: [manual], now: NOW });

    assert.equal(verdict.toInsert.length, 1);
    assert.equal(verdict.toDelete.length, 0);
    assert.equal(verdict.toCancel.length, 0);
  });
});

describe("rapprochement — ce que le rafraîchissement retire", () => {
  it("retire un événement à venir disparu de sa source, que personne ne suit", () => {
    const verdict = reconcileSourceEvents({ incoming: [], existing: [stored()], now: NOW });

    assert.deepEqual(verdict.toDelete.map((event) => event.id), ["evt-1"]);
  });

  it("annule, sans le retirer, un événement disparu que quelqu'un suit", () => {
    const followed = stored({ favoritedBy: ["u1"] });
    const joined = stored({ id: "evt-2", participants: ["u2"], startDateTime: "2026-09-09T19:00:00.000+02:00", endDateTime: "2026-09-09T23:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [], existing: [followed, joined], now: NOW });

    assert.deepEqual(verdict.toCancel.map((event) => event.id).sort(), ["evt-1", "evt-2"]);
    assert.equal(verdict.toDelete.length, 0);
  });

  it("n'annule pas deux fois", () => {
    const verdict = reconcileSourceEvents({
      incoming: [],
      existing: [stored({ favoritedBy: ["u1"], status: "cancelled" })],
      now: NOW,
    });

    assert.equal(verdict.toCancel.length, 0);
  });

  it("rend son statut à un événement annulé qui réapparaît", () => {
    const verdict = reconcileSourceEvents({
      incoming: [incoming()],
      existing: [stored({ favoritedBy: ["u1"], status: "cancelled" })],
      now: NOW,
    });

    assert.equal(verdict.toUpdate.length, 1);
    assert.equal(verdict.toUpdate[0].patch.status, "available");
  });

  it("laisse le passé tranquille", () => {
    const past = stored({ startDateTime: "2026-08-20T19:00:00.000+02:00", endDateTime: "2026-08-20T23:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [], existing: [past], now: NOW });

    assert.equal(verdict.toDelete.length, 0);
  });

  it("garde un événement qui a eu lieu hier soir, même suivi", () => {
    // Une boutique retire un événement de son agenda sitôt qu'il a eu lieu :
    // ce n'est pas une annulation, et les présences doivent rester.
    const yesterday = stored({
      startDateTime: "2026-08-31T19:00:00.000+02:00",
      endDateTime: "2026-08-31T23:00:00.000+02:00",
      participants: ["u1"],
    });

    const verdict = reconcileSourceEvents({ incoming: [], existing: [yesterday], now: NOW });

    assert.equal(verdict.toDelete.length, 0);
    assert.equal(verdict.toCancel.length, 0);
  });

  it("garde un événement déjà commencé", () => {
    const ongoing = stored({ startDateTime: "2026-09-01T09:00:00.000+02:00", endDateTime: "2026-09-01T13:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [], existing: [ongoing], now: NOW });

    assert.equal(verdict.toDelete.length, 0);
  });

  it("retire un événement de ce soir disparu de l'agenda du jour", () => {
    const tonight = stored({ startDateTime: "2026-09-01T19:00:00.000+02:00", endDateTime: "2026-09-01T23:00:00.000+02:00" });

    const verdict = reconcileSourceEvents({ incoming: [], existing: [tonight], now: NOW });

    assert.equal(verdict.toDelete.length, 1);
  });

  it("ne retire rien d'une source qui n'a pas répondu", () => {
    const fromBroken = stored();
    const fromHealthy = stored({ id: "evt-2", source: { url: OTHER_SOURCE } });

    const verdict = reconcileSourceEvents({
      incoming: [],
      existing: [fromBroken, fromHealthy],
      now: NOW,
      failedSourceUrls: [SOURCE],
    });

    assert.deepEqual(verdict.toDelete.map((event) => event.id), ["evt-2"]);
  });

  it("ne retire un événement sans source connue que si toutes ont répondu", () => {
    const legacy = stored({ source: undefined });

    const withFailure = reconcileSourceEvents({ incoming: [], existing: [legacy], now: NOW, failedSourceUrls: [SOURCE] });
    assert.equal(withFailure.toDelete.length, 0);

    const allRead = reconcileSourceEvents({ incoming: [], existing: [legacy], now: NOW });
    assert.equal(allRead.toDelete.length, 1);
  });

  it("rattache un événement sans source connue à celle qui le rend", () => {
    const legacy = stored({ source: undefined, url: "https://boutique.example/e/1" });
    const event = incoming({ url: "https://boutique.example/e/1" });

    const verdict = reconcileSourceEvents({ incoming: [event], existing: [legacy], now: NOW });

    assert.equal(verdict.toUpdate.length, 1);
    assert.deepEqual(verdict.toUpdate[0].patch.source, { url: SOURCE, externalId: undefined });
  });
});
