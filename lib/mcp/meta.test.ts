import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
    describeAssociations,
    describeCardStats,
    describeMatchup,
    describeOverview,
    describeScope,
    describeStapleGroups,
    describeTournament,
    findTournaments,
    matchByName,
    percent,
    pickByName,
    points,
    rate,
    resolveWinratePeriod,
    sampleLegends,
    trendMovers,
} from "./meta";
import { computeAssociations, computeCardStats, computeOverview, computeStapleGroups, type MetaCard, type MetaSampleDeck } from "@/lib/meta/stats";
import { computeTournamentStats, listTournaments } from "@/lib/meta/tournaments";

// Les espaces de Intl en français sont insécables : on les ramène à des espaces simples pour comparer.
const plain = (text: string) => text.replace(/[  ]/g, " ");

const cards: Record<string, MetaCard> = {
    L1: { id: "L1", name: "Jinx, Loose Cannon", domains: ["Fury", "Chaos"], setCode: "OGN" },
    L2: { id: "L2", name: "Viktor, Herald of the Arcane", domains: ["Mind", "Order"], setCode: "OGN" },
    F1: { id: "F1", name: "Cloth Armor", type: "Gear", domains: ["Fury"], setCode: "OGN" },
    C1: { id: "C1", name: "Rebuke", type: "Spell", domains: ["Chaos"], setCode: "SFD" },
    M1: { id: "M1", name: "Thinking Ahead", type: "Spell", domains: ["Mind"], setCode: "SFD" },
    N1: { id: "N1", name: "Neeko", type: "Unit", domains: [], setCode: "RAD" },
};

let next = 0;
function deck(partial: Partial<MetaSampleDeck> & { cards: MetaSampleDeck["cards"] }): MetaSampleDeck {
    next += 1;
    return {
        id: `d${next}`,
        name: `Deck ${next}`,
        domains: ["Fury", "Chaos"],
        legendCardId: "L1",
        source: "Regional Lyon",
        eventDate: "2026-11-01T00:00:00.000Z",
        ...partial,
    };
}

const decks: MetaSampleDeck[] = [
    deck({ placement: "1er", pilot: "Alice", cards: [{ cardId: "F1", quantity: 3 }, { cardId: "C1", quantity: 2 }, { cardId: "N1", quantity: 1 }] }),
    deck({ placement: "2e", cards: [{ cardId: "F1", quantity: 3 }, { cardId: "N1", quantity: 2 }] }),
    deck({ placement: "Top 8", legendCardId: "L2", domains: ["Mind", "Order"], cards: [{ cardId: "M1", quantity: 3 }, { cardId: "N1", quantity: 1 }] }),
    deck({ source: "RC Europe", cards: [{ cardId: "F1", quantity: 2 }, { cardId: "C1", quantity: 3 }] }),
];

describe("formats", () => {
    it("écrit les parts, les winrates et les écarts à la française", () => {
        assert.equal(plain(percent(0.425)), "43 %");
        assert.equal(plain(rate(0.5432)), "54,3 %");
        assert.equal(points(0.09), "+9 pts");
        assert.equal(points(-0.04), "−4 pts");
    });
});

describe("matchByName / pickByName", () => {
    const names = ["Jinx, Loose Cannon", "Jinx, Demolitionist", "Kennen, Heart of the Tempest", "Lée Sin"];

    it("préfère le nom exact, puis le début, puis n'importe quelle partie", () => {
        assert.deepEqual(matchByName(names, (name) => name, "kennen"), ["Kennen, Heart of the Tempest"]);
        assert.deepEqual(matchByName(names, (name) => name, "jinx, loose cannon"), ["Jinx, Loose Cannon"]);
        assert.deepEqual(matchByName(names, (name) => name, "tempest"), ["Kennen, Heart of the Tempest"]);
    });

    it("ignore accents et casse", () => {
        assert.deepEqual(matchByName(names, (name) => name, "LEE SIN"), ["Lée Sin"]);
    });

    it("signale les ambiguïtés et l'absence", () => {
        assert.ok("ambiguous" in pickByName(names, (name) => name, "Jinx"));
        assert.ok("none" in pickByName(names, (name) => name, "Teemo"));
        assert.deepEqual(pickByName(names, (name) => name, "Kennen"), { found: "Kennen, Heart of the Tempest" });
    });

    it("tient deux fiches du même nom pour une seule réponse", () => {
        const printings = [{ id: "a", name: "Neeko" }, { id: "b", name: "Neeko" }];
        assert.deepEqual(pickByName(printings, (card) => card.name, "neeko"), { found: printings[0] });
    });
});

describe("sampleLegends", () => {
    it("donne la clé du filtre et le nom de la carte", () => {
        assert.deepEqual(sampleLegends(decks, cards), [
            { key: "L1", name: "Jinx, Loose Cannon" },
            { key: "L2", name: "Viktor, Herald of the Arcane" },
        ]);
    });
});

describe("describeScope", () => {
    it("dit la période et les filtres", () => {
        assert.equal(
            describeScope({ gameName: "Riftbound", decks: 12, periodDays: 30, legend: "Jinx" }),
            "Méta Riftbound — 12 decks de tournoi, 30 derniers jours (légende Jinx).",
        );
        assert.equal(describeScope({ gameName: "Riftbound", decks: 1, periodDays: 0 }), "Méta Riftbound — 1 deck de tournoi, tout l'historique.");
    });
});

describe("describeOverview", () => {
    it("liste les légendes, les domaines et la tendance", () => {
        const stats = computeCardStats(decks, cards);
        const text = plain(describeOverview(computeOverview(decks, cards, stats), new Map([["Rebuke", 0.2], ["Neeko", -0.1], ["Cloth Armor", 0.01]])));
        assert.match(text, /- Jinx, Loose Cannon — 3 decks \(75 %\), 2 en top 8 · Fury \+ Chaos/);
        assert.match(text, /Paire la plus jouée : Chaos \+ Fury/);
        assert.match(text, /En hausse : Rebuke \+20 pts\./);
        assert.match(text, /En baisse : Neeko −10 pts\./);
        assert.doesNotMatch(text, /Cloth Armor \+1/);
    });
});

describe("trendMovers", () => {
    it("ne garde que les écarts d'au moins 5 points", () => {
        const movers = trendMovers(new Map([["A", 0.06], ["B", 0.02], ["C", -0.3]]));
        assert.deepEqual(movers, { up: [["A", 0.06]], down: [["C", -0.3]] });
        assert.deepEqual(trendMovers(null), { up: [], down: [] });
    });
});

describe("describeCardStats", () => {
    const stats = computeCardStats(decks, cards);

    it("pagine et dit comment voir la suite", () => {
        const text = plain(describeCardStats(stats, null, { limit: 2 }));
        assert.match(text, /\(1–2 sur 4\)/);
        assert.match(text, /- Cloth Armor \(Gear\) — 3 decks \(75 %\), 100 % des decks Fury, 2,7 ex\. en moyenne/);
        assert.match(text, /relancer avec offset 2/);
    });

    it("dit qu'une carte sans domaine est incolore", () => {
        assert.match(plain(describeCardStats(stats, null, { limit: 10 })), /Neeko \(Unit\) — 3 decks \(75 %\), incolore/);
    });
});

describe("describeAssociations", () => {
    it("met la carte en titre et liste ses associations", () => {
        const stats = computeCardStats(decks, cards);
        const associations = computeAssociations(decks, cards, stats, "Rebuke")!;
        const text = plain(describeAssociations(associations));
        assert.match(text, /^\*\*Rebuke\*\* — 2 decks \(50 %\)/);
        assert.match(text, /Légendes qui la jouent : Jinx, Loose Cannon \(100 %\)/);
    });
});

describe("describeStapleGroups", () => {
    it("dit quand un domaine a trop peu de decks", () => {
        const stats = computeCardStats(decks, cards);
        const settings = { threshold: 0.75, minDecks: 3 };
        const text = plain(describeStapleGroups(computeStapleGroups(stats, decks, settings), settings));
        assert.match(text, /\*\*Fury\*\* — 3 decks\n- Cloth Armor — 100 %/);
        assert.match(text, /\*\*Mind\*\* — 1 deck\nTrop peu de decks/);
    });
});

describe("resolveWinratePeriod", () => {
    const releases = { OGN: "2025-10-31", SFD: "2026-02-13" };
    const setNames = { OGN: "Origins", SFD: "Spiritforged" };
    const today = "2026-11-10";

    it("prend l'extension en cours par défaut", () => {
        const result = resolveWinratePeriod({ releases, setNames, today });
        assert.ok("period" in result);
        assert.equal(result.period.from, "2026-02-13");
        assert.equal(result.period.to, undefined);
        assert.deepEqual(result.period.query, { ext: "SFD" });
        assert.match(result.period.label, /^extension Spiritforged \(depuis le/);
    });

    it("trouve une extension par code ou par nom", () => {
        const byName = resolveWinratePeriod({ releases, setNames, today, setCode: "origins" });
        assert.ok("period" in byName);
        assert.equal(byName.period.from, "2025-10-31");
        assert.equal(byName.period.to, "2026-02-12");
        assert.ok("period" in resolveWinratePeriod({ releases, setNames, today, setCode: "ogn" }));
    });

    it("refuse une extension inconnue en citant celles qui sont datées", () => {
        const result = resolveWinratePeriod({ releases, setNames, today, setCode: "XYZ" });
        assert.ok("error" in result);
        assert.match(result.error, /Origins \(OGN\)/);
    });

    it("prend des dates, ou tout l'historique", () => {
        const dates = resolveWinratePeriod({ releases, setNames, today, from: "2026-03-01" });
        assert.ok("period" in dates);
        assert.deepEqual(dates.period.query, { wr: "dates", du: "2026-03-01" });
        assert.ok("error" in resolveWinratePeriod({ releases, setNames, today, from: "01/03/2026" }));

        const all = resolveWinratePeriod({ releases, setNames, today, allTime: true });
        assert.ok("period" in all);
        assert.equal(all.period.from, undefined);
        assert.deepEqual(all.period.query, { wr: "all" });
    });

    it("compte tout l'historique quand aucune sortie n'est datée", () => {
        const result = resolveWinratePeriod({ releases: {}, setNames, today });
        assert.ok("period" in result);
        assert.equal(result.period.label, "tout l'historique");
        assert.deepEqual(result.period.query, {});
    });
});

describe("describeMatchup", () => {
    it("signale un échantillon faible", () => {
        assert.equal(
            plain(describeMatchup("Jinx", "Kennen", { wins: 6, losses: 3, draws: 1 })),
            "**Jinx contre Kennen** : 65,0 % sur 10 matchs (6-3-1), échantillon faible.",
        );
        assert.equal(describeMatchup("Jinx", "Kennen", undefined), "Aucun match Jinx contre Kennen sur cette période.");
    });
});

describe("tournois", () => {
    const summaries = listTournaments(decks, cards);

    it("retrouve un tournoi par son nom ou son slug", () => {
        assert.deepEqual(findTournaments(summaries, "lyon").map((summary) => summary.source), ["Regional Lyon"]);
        assert.deepEqual(findTournaments(summaries, "rc-europe").map((summary) => summary.source), ["RC Europe"]);
        assert.deepEqual(findTournaments(summaries, "lyon", "2026-10-01"), []);
    });

    it("décrit le top 8 avec les ids des decks", () => {
        const lyon = summaries.find((summary) => summary.source === "Regional Lyon")!;
        const lyonDecks = decks.filter((item) => item.source === "Regional Lyon");
        const text = plain(describeTournament(lyon, computeTournamentStats(lyonDecks, cards), { deckLink: (id) => `https://joutes.app/decks/${id}`, cards }));
        assert.match(text, /\*\*Regional Lyon\*\* — 1 nov\. 2026, 3 decks relevés \(3 classés\)\./);
        assert.match(text, /- 1er · Jinx, Loose Cannon \(Alice\) · Fury \+ Chaos — id d\d+/);
        assert.match(text, /id d\d+ · https:\/\/joutes\.app\/decks\/d\d+/);
    });
});
