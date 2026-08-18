import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatRecord,
  groupByYear,
  playerInitials,
  playerLabel,
  rankLabel,
  sortNewestFirst,
  yearOf,
  type TimelineEntry,
} from "./timeline";

function entry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    tournamentId: "t1",
    name: "Étape 1",
    status: "completed",
    date: "2026-02-21T10:00:00.000Z",
    year: "2026",
    playersCount: 8,
    points: 40,
    winner: null,
    podium: [],
    feats: [],
    ...overrides,
  };
}

describe("playerLabel", () => {
  it("colle le discriminant au nom affiché", () => {
    assert.equal(playerLabel({ displayName: "Ombrelune", discriminator: "4417" }), "Ombrelune#4417");
  });

  it("retombe sur le pseudonyme de compte sans nom affiché", () => {
    assert.equal(playerLabel({ username: "kaelis", discriminator: "0932" }), "kaelis#0932");
  });

  it("omet le discriminant quand il est inconnu", () => {
    assert.equal(playerLabel({ displayName: "Sylve" }), "Sylve");
  });

  it("rend le repli pour un joueur absent ou anonyme", () => {
    assert.equal(playerLabel(null), "Joueur inconnu");
    assert.equal(playerLabel(undefined), "Joueur inconnu");
    assert.equal(playerLabel({}), "Joueur inconnu");
    assert.equal(playerLabel({}, "Invité"), "Invité");
  });
});

describe("playerInitials", () => {
  it("prend les deux premières lettres, en capitales", () => {
    assert.equal(playerInitials({ displayName: "Ombrelune" }), "OM");
    assert.equal(playerInitials({ username: "kaelis" }), "KA");
  });

  it("ignore les espaces de bordure", () => {
    assert.equal(playerInitials({ displayName: "  Sylve" }), "SY");
  });

  it("rend un point d'interrogation faute de nom", () => {
    assert.equal(playerInitials({}), "?");
    assert.equal(playerInitials({ displayName: "   " }), "?");
    assert.equal(playerInitials(null), "?");
  });
});

describe("rankLabel", () => {
  it("écrit « 1er » pour la première place et « Ne » ensuite", () => {
    // Le seul ordinal irrégulier du français : « 1e » ne s'écrit pas.
    assert.equal(rankLabel(1), "1er");
    assert.equal(rankLabel(2), "2e");
    assert.equal(rankLabel(11), "11e");
  });
});

describe("formatRecord", () => {
  it("assemble victoires, nuls et défaites", () => {
    assert.equal(formatRecord({ wins: 3, draws: 1, losses: 1 }), "3V/1N/1D");
  });

  it("omet les colonnes à zéro", () => {
    assert.equal(formatRecord({ wins: 5, draws: 0, losses: 0 }), "5V");
    assert.equal(formatRecord({ wins: 0, draws: 0, losses: 2 }), "2D");
  });

  it("rend une chaîne vide pour un bilan vierge", () => {
    // Un joueur inscrit qui n'a encore rien joué : mieux vaut ne rien afficher
    // que « 0V/0N/0D ».
    assert.equal(formatRecord({ wins: 0, draws: 0, losses: 0 }), "");
  });
});

describe("yearOf", () => {
  it("lit l'année dans le fuseau de l'application", () => {
    // 31 décembre 23 h à Paris, soit le 31 à 22 h UTC : l'année du tournoi est
    // celle où il s'est joué.
    assert.equal(yearOf(new Date("2025-12-31T22:00:00.000Z")), "2025");
    // 1er janvier 00 h 30 à Paris, soit le 31 décembre 23 h 30 UTC.
    assert.equal(yearOf(new Date("2025-12-31T23:30:00.000Z")), "2026");
  });
});

describe("sortNewestFirst", () => {
  it("place le plus récent en tête", () => {
    const sorted = sortNewestFirst([
      { date: "2025-11-15T10:00:00.000Z", name: "Étape 1" },
      { date: "2026-02-21T10:00:00.000Z", name: "Étape 4" },
      { date: "2026-01-24T10:00:00.000Z", name: "Étape 3" },
    ]);
    assert.deepEqual(sorted.map((e) => e.name), ["Étape 4", "Étape 3", "Étape 1"]);
  });

  it("départage deux tournois du même jour par leur nom", () => {
    // Sans ce départage, deux tournois du même jour changeraient de place d'un
    // rendu à l'autre.
    const same = "2026-02-21T10:00:00.000Z";
    const sorted = sortNewestFirst([
      { date: same, name: "Nocturne" },
      { date: same, name: "Grand Prix" },
    ]);
    assert.deepEqual(sorted.map((e) => e.name), ["Grand Prix", "Nocturne"]);
  });

  it("ne modifie pas le tableau reçu", () => {
    const input = [
      { date: "2025-11-15T10:00:00.000Z", name: "A" },
      { date: "2026-02-21T10:00:00.000Z", name: "B" },
    ];
    sortNewestFirst(input);
    assert.deepEqual(input.map((e) => e.name), ["A", "B"]);
  });
});

describe("groupByYear", () => {
  it("regroupe les entrées consécutives d'une même année", () => {
    const groups = groupByYear([
      entry({ tournamentId: "a", year: "2026" }),
      entry({ tournamentId: "b", year: "2026" }),
      entry({ tournamentId: "c", year: "2025" }),
    ]);

    assert.deepEqual(groups.map((g) => g.year), ["2026", "2025"]);
    assert.deepEqual(groups[0].entries.map((e) => e.tournamentId), ["a", "b"]);
    assert.deepEqual(groups[1].entries.map((e) => e.tournamentId), ["c"]);
  });

  it("conserve l'ordre reçu sans le réordonner", () => {
    // Le tri est fait en amont : regrouper ne doit pas le refaire, sinon deux
    // règles d'ordre coexisteraient.
    const groups = groupByYear([
      entry({ tournamentId: "a", year: "2025" }),
      entry({ tournamentId: "b", year: "2026" }),
      entry({ tournamentId: "c", year: "2025" }),
    ]);

    assert.deepEqual(groups.map((g) => g.year), ["2025", "2026", "2025"]);
  });

  it("rend une liste vide pour aucune entrée", () => {
    assert.deepEqual(groupByYear([]), []);
  });
});
