import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { CommentThreadPayload } from "@/lib/decks/comment-service";
import type { DeckCommentView } from "@/lib/decks/comments";
import type { GroupMetaPage } from "@/lib/play-groups/meta-data";
import type { TournamentResult } from "@/lib/types/TournamentResult";
import {
    commentErrorText,
    describeCommentThread,
    describeGroupDecks,
    describeGroupMeta,
    describeGroupTournaments,
    describeMyResults,
    describeResult,
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

    it("liste chaque deck avec son identifiant, son auteur et son épingle", () => {
        const text = describeGroupDecks("Les Corbeaux", [{ ...line, pinnedAt: "2026-11-01", pinNote: "prépa RQ Metz" }], 3);
        assert.match(text, /1 deck sur 3/);
        assert.match(text, /\*\*Kennen Tempête\*\* \(deckId: d1\) — Kennen · par Mehdi · privé, visible du groupe · v7 — épinglé : prépa RQ Metz/);
    });
});

describe("describeCommentThread", () => {
    it("invite à écrire le premier commentaire d'un fil vide", () => {
        assert.match(describeCommentThread(thread([]), "Kennen", "fil du groupe « Les Corbeaux »"), /Aucun commentaire/);
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
            "Kennen",
            "fil du groupe",
        );
        assert.match(text, /1 commentaire ouvert, 1 résolu/);
        assert.match(text, /- \[c1\] Hugo, .* — écrit sur la v2 — nouveau :/);
        assert.match(text, /Cartes : Hextech Ray, Lightning Bolt \(plus dans le deck\)/);
        assert.match(text, / {2}- \[c2\] Lisa/);
        assert.match(text, /Résolus :[\s\S]*\[c3\][\s\S]*Résolu en v3/);
    });

    it("garde la place d'un commentaire supprimé qui a des réponses", () => {
        const text = describeCommentThread(thread([comment({ deleted: true, body: "" })]), "Kennen", "notes");
        assert.match(text, /\[c1\] Hugo, .* : \(supprimé\)/);
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
        assert.match(text, /- Kai'Sa : 100.% \(3 decks\) · \+85 pts vs méta · 70,0.% de victoires/);
        assert.match(text, /- Fury : 100.% \(\+60 pts vs méta\)/);
        assert.match(text, /- Lisa : 2 tournois · meilleur : 2e · 70,0.% · Kai'Sa/);
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
