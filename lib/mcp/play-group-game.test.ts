import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommentThreadPayload } from "@/lib/decks/comment-service";
import type { DeckCommentView } from "@/lib/decks/comments";
import type { GroupMetaPage } from "@/lib/play-groups/meta-data";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import {
    checkPeriod,
    commentErrorText,
    describeCommentThread,
    describeGroupDecks,
    describeGroupMeta,
    describeGroupTournaments,
    describeMyResults,
    describeResult,
    matchDeckCards,
    normalizeSetCode,
    pageMyResults,
    parseBefore,
    pickGame,
    pickMember,
    placementLabel,
    resultErrorText,
} from "./play-group-game";

const permissions: DeckCommentView["permissions"] = { canResolve: true, canDelete: true, canEdit: true };

function comment(overrides: Partial<DeckCommentView>): DeckCommentView {
    return {
        id: "c1",
        authorId: "u1",
        body: "Belle liste.",
        cards: [],
        deckVersion: 3,
        createdAt: "2026-11-08T10:00:00.000Z",
        deleted: false,
        permissions,
        replies: [],
        ...overrides,
    };
}

function thread(comments: DeckCommentView[], lastReadAt?: string): CommentThreadPayload {
    return {
        deckId: "d1",
        deckName: "Kennen",
        space: "group:g1",
        deckVersion: 3,
        comments,
        authors: { u1: { name: "Hugo" }, u2: { name: "Lisa" } },
        ...(lastReadAt ? { lastReadAt } : {}),
    };
}

const result: TournamentResult = {
    id: "r1",
    userId: "u1",
    gameId: "rb",
    source: "declared",
    sourceRef: "declared:r1",
    name: "RQ Lyon",
    date: "2026-10-11T09:00:00.000Z",
    place: "Lyon",
    playerCount: 180,
    placement: 3,
    topCut: 8,
    record: { wins: 7, losses: 1, draws: 0 },
    legendName: "Rek'Sai, Void Burrower",
    domains: ["Fury"],
    visibility: "groups",
    createdAt: "2026-10-12T09:00:00.000Z",
    updatedAt: "2026-10-12T09:00:00.000Z",
};

describe("placementLabel", () => {
    it("écrit 1er, puis 2e, 3e…", () => {
        assert.equal(placementLabel(1), "1er");
        assert.equal(placementLabel(3), "3e");
    });
});

describe("describeGroupDecks", () => {
    const line = { deckId: "d1", name: "Kennen Tempête", legendName: "Kennen", ownerName: "Mehdi", visibility: "private", version: 7 };

    it("dit quand le groupe n'a aucun deck, et quand les filtres écartent tout", () => {
        assert.match(describeGroupDecks("Les Corbeaux", [], 0), /Aucun deck partagé/);
        assert.match(describeGroupDecks("Les Corbeaux", [], 4), /ne répond à ces filtres \(4 decks au total\)/);
    });

    it("donne la page et la suivante", () => {
        const text = describeGroupDecks("Les Corbeaux", [line], 60, { matched: 50, page: 1, pageCount: 3 });
        assert.match(text, /50 decks sur 60 .* Page 1\/3 : page = 2 pour la suite\./);
    });

    it("liste chaque deck avec son identifiant, son auteur et son épingle", () => {
        const text = describeGroupDecks("Les Corbeaux", [{ ...line, pinnedAt: "2026-11-01", pinNote: "prépa RQ Metz" }], 3);
        assert.match(text, /1 deck sur 3/);
        assert.match(text, /\*\*Kennen Tempête\*\* \(deckId: d1\) — Kennen · par Mehdi · privé, visible du groupe · v7 — épinglé : prépa RQ Metz/);
    });
});

describe("describeCommentThread", () => {
    it("invite à écrire le premier commentaire d'un fil vide", () => {
        assert.match(describeCommentThread(thread([]), "fil du groupe « Les Corbeaux »"), /Aucun commentaire/);
    });

    it("sépare ouverts et résolus, et montre réponses, cartes retirées et nouveautés", () => {
        const text = describeCommentThread(
            thread(
                [
                    comment({
                        id: "c1",
                        deckVersion: 2,
                        createdAt: "2026-11-09T10:00:00.000Z",
                        cards: [
                            { id: "a", name: "Hextech Ray", removed: false },
                            { id: "b", name: "Lightning Bolt", removed: true },
                        ],
                        replies: [comment({ id: "c2", authorId: "u2", body: "Testé, c'est mieux." })],
                    }),
                    comment({ id: "c3", resolvedAt: "2026-11-07T10:00:00.000Z", resolvedVersion: 3 }),
                ],
                "2026-11-08T12:00:00.000Z",
            ),
            "fil du groupe",
        );
        assert.match(text, /1 commentaire ouvert, 1 résolu/);
        assert.match(text, /- \[c1\] Hugo, .* — écrit sur la v2 — nouveau :/);
        assert.match(text, /Cartes : Hextech Ray, Lightning Bolt \(plus dans le deck\)/);
        assert.match(text, / {2}- \[c2\] Lisa/);
        assert.match(text, /Résolus :[\s\S]*\[c3\][\s\S]*Résolu en v3/);
    });

    it("garde la place d'un commentaire supprimé qui a des réponses", () => {
        const text = describeCommentThread(
            thread([comment({ deleted: true, body: "", replies: [comment({ id: "c2", authorId: "u2" })] })]),
            "notes",
        );
        assert.match(text, /\[c1\] Hugo, .* : \(supprimé\)/);
        assert.match(text, /0 commentaire ouvert/);
        assert.match(text, /ni d'un commentaire supprimé/);
    });
});

describe("describeResult", () => {
    it("résume place, bilan, légende, source et visibilité", () => {
        assert.equal(
            describeResult(result, "Riftbound"),
            "- 11 oct. 2026 — **RQ Lyon** : 3e/180 (top 8) · 7-1 · Rek'Sai, Void Burrower · Riftbound · Lyon · déclaré · visible des groupes",
        );
    });

    it("dit « sans classement » quand il n'y en a pas", () => {
        assert.match(describeResult({ ...result, placement: undefined }), /180 joueurs, sans classement/);
    });

    it("invite à déclarer quand la liste est vide", () => {
        assert.match(describeMyResults([], () => undefined), /declare_tournament_result/);
    });
});

describe("describeGroupTournaments", () => {
    it("donne le palmarès, les tournois et la page suivante", () => {
        const text = describeGroupTournaments(
            "Les Corbeaux",
            {
                months: [{ month: "2026-10", tournaments: [{ name: "RQ Lyon", date: result.date, place: "Lyon", playerCount: 180, results: [result] }] }],
                nextBefore: "2026-09",
            },
            [{ userId: "u1", wins: 1, podiums: 2, topEights: 3, tournaments: 5 }],
            (id) => (id === "u1" ? "Lisa" : "?"),
        );
        assert.match(text, /- Lisa : 1 victoire, 3 top 8, 5 tournois/);
        assert.match(text, /\*\*RQ Lyon\*\* \(Lyon, 180 joueurs\)\n {2}- Lisa : 3e · 7-1 · Rek'Sai/);
        assert.match(text, /before = « 2026-09 »/);
    });
});

describe("describeGroupMeta", () => {
    const record = { wins: 0, losses: 0, draws: 0 };
    const page = {
        games: [{ game: { id: "rb", name: "Riftbound", slug: "riftbound" }, count: 3, hasMeta: true }],
        game: { id: "rb", name: "Riftbound", slug: "riftbound" },
        hasMeta: true,
        periods: [{ setCode: "RAD", name: "Radiance", from: "2026-09-25" }],
        period: { setCode: "RAD", name: "Radiance", from: "2026-09-25" },
        memberIds: ["u1"],
        meta: {
            totals: { ...record, wins: 7, losses: 3, participations: 3, tournaments: 2, members: 1, topEights: 1, matches: 10, rate: 0.7 },
            overview: {},
            legends: [
                { key: "leg-kaisa", name: "Kai'Sa", domains: [], decks: 3, share: 1, topCuts: 1, ...record, matches: 10, rate: 0.7, userIds: ["u1"], metaShare: 0.15 },
            ],
            domains: [{ domain: "Fury", decks: 3, share: 1, metaShare: 0.4 }],
            members: [{ ...record, userId: "u1", tournaments: 2, topEights: 1, best: 2, matches: 10, rate: 0.7, legends: ["leg-kaisa"] }],
        },
        matchups: { counted: 0, known: 0, opponents: [], pairings: [] },
        cardStats: [],
        withCards: 0,
        cards: {},
        compared: true,
    } as unknown as GroupMetaPage;

    it("écrit la période, les écarts à la méta et le nom des légendes des membres", () => {
        const text = describeGroupMeta("Les Corbeaux", page, () => "Lisa");
        assert.match(text, /extension Radiance \(depuis le 25 sept\. 2026\), comparée à la méta du jeu/);
        assert.match(text, /- Kai'Sa : 100.% \(3 participations\) · \+85 pts vs méta · 70,0.% de victoires/);
        assert.match(text, /- Fury : 100.% \(\+60 pts vs méta\)/);
        assert.match(text, /- Lisa : 2 tournois · meilleur : 2e · 70,0.% de victoires · Kai'Sa/);
    });

    it("dit quand le groupe n'a aucun résultat", () => {
        assert.match(describeGroupMeta("Les Corbeaux", { ...page, game: undefined }, () => ""), /pas de méta à calculer/);
    });
});

describe("textes d'erreur", () => {
    it("traduit les codes des services, et nomme ceux qu'il ne connaît pas", () => {
        assert.match(commentErrorText("CARD_NOT_IN_DECK"), /pas dans le deck/);
        assert.match(resultErrorText("DUPLICATE"), /déjà dans vos résultats/);
        assert.equal(resultErrorText("AUTRE"), "Erreur : AUTRE.");
    });
});

describe("pickMember", () => {
    const members = [
        { userId: "u1", name: "Thomas" },
        { userId: "u2", name: "Thomas" },
        { userId: "u3", name: "Lisa" },
    ];

    it("ne choisit pas entre deux homonymes et donne leurs identifiants", () => {
        const picked = pickMember(members, "thomas", "u3");
        assert.ok("error" in picked);
        assert.match(picked.error, /Thomas \(id : u1\), Thomas \(id : u2\)/);
    });

    it("trouve par nom, par identifiant et « moi »", () => {
        assert.deepEqual(pickMember(members, "Lis", "u1"), { userId: "u3" });
        assert.deepEqual(pickMember(members, "u2", "u1"), { userId: "u2" });
        assert.deepEqual(pickMember(members, "Moi", "u1"), { userId: "u1" });
    });

    it("garde une seule personne listée deux fois", () => {
        assert.deepEqual(pickMember([members[2], members[2]], "Lisa", "u1"), { userId: "u3" });
    });

    it("liste les membres quand personne ne répond", () => {
        const picked = pickMember(members, "Hugo", "u1");
        assert.ok("error" in picked);
        assert.match(picked.error, /Aucun membre « Hugo »/);
    });
});

describe("pickGame", () => {
    const games = [
        { id: "rb", slug: "riftbound", name: "Riftbound" },
        { id: "swu", slug: "star-wars-unlimited", name: "Star Wars Unlimited" },
        { id: "swd", slug: "star-wars-destiny", name: "Star Wars Destiny" },
    ];

    it("trouve par slug, identifiant ou nom", () => {
        assert.deepEqual(pickGame(games, "riftbound"), { game: games[0] });
        assert.deepEqual(pickGame(games, "swu"), { game: games[1] });
        assert.deepEqual(pickGame(games, "star wars u"), { game: games[1] });
    });

    it("dit qu'un nom est ambigu plutôt qu'introuvable", () => {
        const picked = pickGame(games, "Star Wars");
        assert.ok("error" in picked);
        assert.match(picked.error, /Plusieurs jeux .* Star Wars Unlimited, Star Wars Destiny/);
        const none = pickGame(games, "Magic");
        assert.ok("error" in none);
        assert.match(none.error, /introuvable/);
    });
});

describe("matchDeckCards", () => {
    const cards = [
        { id: "OGN-001", name: "Jinx, Loose Cannon" },
        { id: "OGN-002", name: "Jinx, Rebel" },
        { id: "OGN-003", name: "Hextech Ray" },
    ];

    it("lie par nom ou identifiant, sans doublon", () => {
        assert.deepEqual(matchDeckCards(cards, ["hextech", "OGN-003", "OGN-001"]), { cardIds: ["OGN-003", "OGN-001"] });
    });

    it("refuse un nom ambigu ou absent du deck", () => {
        const ambiguous = matchDeckCards(cards, ["Jinx"]);
        assert.ok("error" in ambiguous);
        assert.match(ambiguous.error, /plusieurs cartes du deck/);
        const missing = matchDeckCards(cards, ["Lightning Bolt"]);
        assert.ok("error" in missing);
        assert.match(missing.error, /Aucune carte « Lightning Bolt »/);
    });
});

describe("parseBefore", () => {
    it("accepte AAAA-MM seulement", () => {
        assert.deepEqual(parseBefore(" 2026-09 "), { before: "2026-09" });
        assert.ok("error" in parseBefore("2026-13"));
        assert.ok("error" in parseBefore("sept. 2026"));
    });
});

describe("extension de la méta", () => {
    it("met le code en majuscules et reconnaît « tout »", () => {
        assert.deepEqual(normalizeSetCode("unl"), { ext: "UNL" });
        assert.deepEqual(normalizeSetCode("Tout"), { ext: "tout" });
        assert.deepEqual(normalizeSetCode("all"), { ext: "tout" });
        assert.ok("error" in normalizeSetCode("UNL; drop"));
    });

    it("signale une extension que la page n'a pas retenue", () => {
        const periods = [{ setCode: "RAD", name: "Radiance", from: "2026-09-25" }];
        assert.equal(checkPeriod("RAD", { periods, period: periods[0] }), undefined);
        assert.equal(checkPeriod("tout", { periods, period: undefined }), undefined);
        assert.match(checkPeriod("XYZ", { periods, period: periods[0] }) ?? "", /« XYZ » inconnue .* RAD \(Radiance\)/);
    });
});

describe("pageMyResults", () => {
    const results = Array.from({ length: 65 }, (_, index) => ({ id: `r${index}`, date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString() }));

    it("donne les plus récents d'abord, par pages de 30", () => {
        const first = pageMyResults(results);
        assert.deepEqual([first.items.length, first.items[0].id, first.pageCount], [30, "r64", 3]);
        assert.equal(pageMyResults(results, 2).items[0].id, "r34");
        assert.equal(pageMyResults(results, 9).page, 3);
    });

    it("annonce la page suivante", () => {
        const text = describeMyResults([result], () => "Riftbound", { total: 65, page: 1, pageCount: 3 });
        assert.match(text, /65 résultats de tournoi, les plus récents d'abord\. Page 1\/3 : page = 2 pour les plus anciens\./);
    });
});
