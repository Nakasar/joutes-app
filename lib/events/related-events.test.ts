import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areSimilarTitles,
  parseEventReference,
  pickRelatedEvents,
  titleSimilarity,
  titleWords,
} from "./related-events";

const NOW = new Date("2026-10-03T12:00:00.000Z");

function ev(id: string, name: string, start: string, status = "available") {
  return { id, name, startDateTime: start, status };
}

describe("titleWords", () => {
  it("ignore la casse, les accents, la ponctuation et les parenthèses", () => {
    assert.deepEqual(
      titleWords('Star Wars Unlimited - Avant Première "Mondes Natals" (Samedi)'),
      ["star", "wars", "unlimited", "avant", "premiere", "mondes", "natals"]
    );
  });

  it("ignore les jours de la semaine hors parenthèses", () => {
    assert.deepEqual(titleWords("Soirée Commander du Vendredi"), ["soiree", "commander", "du"]);
  });
});

describe("areSimilarTitles", () => {
  it("rapproche deux séances d'une même avant-première", () => {
    assert.equal(
      areSimilarTitles("Avant Première - Homeworlds (Samedi)", "Avant Première - Homeworlds (Dimanche)"),
      true
    );
  });

  it("rapproche deux titres identiques", () => {
    const title = 'Star Wars Unlimited - Avant Premiere "Mondes Natals"';
    assert.equal(areSimilarTitles(title, title), true);
  });

  it("sépare deux tournois de jeux différents", () => {
    assert.equal(areSimilarTitles("Tournoi Riftbound", "Tournoi Lorcana"), false);
  });

  it("ne rapproche rien d'un titre vide", () => {
    assert.equal(titleSimilarity("", "Tournoi"), 0);
  });
});

describe("pickRelatedEvents", () => {
  const event = ev("a", "Avant Première - Homeworlds (Samedi)", "2026-10-10T12:00:00.000Z");

  it("propose les titres proches à venir, le plus proche en premier, 3 au plus", () => {
    const candidates = [
      ev("a", event.name, event.startDateTime),
      ev("d4", "Avant Première - Homeworlds", "2026-10-20T12:00:00.000Z"),
      ev("d1", "Avant Première - Homeworlds (Dimanche)", "2026-10-11T12:00:00.000Z"),
      ev("d3", "Avant première – HOMEWORLDS", "2026-10-15T12:00:00+02:00"),
      ev("d2", "Avant Première - Homeworlds (Vendredi)", "2026-10-12T12:00:00.000Z"),
      ev("x", "Tournoi Lorcana", "2026-10-11T12:00:00.000Z"),
    ];
    const { similar } = pickRelatedEvents({ event, linked: [], candidates, now: NOW });
    assert.deepEqual(similar.map((e) => e.id), ["d1", "d2", "d3"]);
  });

  it("écarte les événements passés et annulés", () => {
    const candidates = [
      ev("past", "Avant Première - Homeworlds", "2026-09-01T12:00:00.000Z"),
      ev("off", "Avant Première - Homeworlds", "2026-10-11T12:00:00.000Z", "cancelled"),
    ];
    assert.deepEqual(pickRelatedEvents({ event, linked: [], candidates, now: NOW }).similar, []);
  });

  it("place les liens posés à part, sans les reproposer", () => {
    const linked = [ev("l2", "Draft", "2026-11-02T12:00:00.000Z"), ev("l1", "Avant Première - Homeworlds", "2026-10-11T12:00:00.000Z")];
    const candidates = [ev("l1", "Avant Première - Homeworlds", "2026-10-11T12:00:00.000Z")];
    const result = pickRelatedEvents({ event, linked, candidates, now: NOW });
    assert.deepEqual(result.linked.map((e) => e.id), ["l1", "l2"]);
    assert.deepEqual(result.similar, []);
  });

  it("ne se lie pas à lui-même", () => {
    const result = pickRelatedEvents({ event, linked: [event], candidates: [], now: NOW });
    assert.deepEqual(result.linked, []);
  });
});

describe("parseEventReference", () => {
  it("lit un lien vers la page d'un événement", () => {
    assert.equal(parseEventReference("https://joutes.app/fr/events/AbC_12-x?joined=1"), "AbC_12-x");
  });

  it("lit un identifiant seul", () => {
    assert.equal(parseEventReference("  AbC_12-x "), "AbC_12-x");
  });

  it("refuse le reste", () => {
    assert.equal(parseEventReference(""), null);
    assert.equal(parseEventReference("pas un lien"), null);
  });
});
