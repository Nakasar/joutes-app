import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
    TournamentMatch,
    TournamentPhase,
    TournamentPlayer,
    TournamentRound,
} from "@/lib/types/Tournament";
import { describeTournamentStatus, plannedRoundsLabel, type TournamentStatusInput } from "./tournament-status";

const created = new Date("2026-10-22T10:00:00Z");

function phase(overrides: Partial<TournamentPhase> = {}): TournamentPhase {
    return {
        id: "phase-swiss",
        tournamentId: "t1",
        name: "Suisse",
        type: "swiss",
        bestOf: 3,
        resultMode: "selection",
        scoringMethod: "fixed",
        fixedScoring: { win: 3, loss: 0, draw: 1 },
        rankOffsets: [],
        eliminationSeeding: "standings",
        bracketSeeding: "opposite",
        swissPairing: "ranked",
        pacing: "live",
        intervalHours: 24,
        deadlineResolution: "double-loss",
        requireMatchStats: false,
        plannedRounds: 5,
        minPlayersPerMatch: 2,
        maxPlayersPerMatch: 2,
        order: 0,
        status: "in-progress",
        createdAt: created,
        ...overrides,
    };
}

function player(id: string, displayName: string, overrides: Partial<TournamentPlayer> = {}): TournamentPlayer {
    return {
        id,
        tournamentId: "t1",
        displayName,
        discriminator: "1234",
        status: "registered",
        syncKey: `tpsk_${id}`,
        addedBy: "u0",
        createdAt: created,
        ...overrides,
    };
}

const round: TournamentRound = {
    id: "r3",
    tournamentId: "t1",
    phaseId: "phase-swiss",
    number: 3,
    status: "in-progress",
    createdAt: created,
};

function match(overrides: Partial<TournamentMatch> = {}): TournamentMatch {
    return {
        id: "m1",
        tournamentId: "t1",
        phaseId: "phase-swiss",
        roundId: "r3",
        players: [{ playerId: "p1", score: 0 }, { playerId: "p2", score: 0 }],
        games: [],
        winnerIds: [],
        tableNumber: 7,
        status: "pending",
        createdAt: created,
        ...overrides,
    };
}

const me = player("p1", "Kevin", { userId: "u1" });
const players = [me, player("p2", "Alice", { discriminator: "4242" }), player("p3", "Bob")];

function input(overrides: Partial<TournamentStatusInput> = {}): TournamentStatusInput {
    const swiss = phase();
    return {
        tournament: { name: "Nexus Night", status: "in-progress" },
        phases: [swiss, phase({ id: "phase-top", name: "Top 8", type: "bracket", plannedRounds: undefined, topCut: 8, order: 1, status: "not-started" })],
        activePhase: swiss,
        currentRound: round,
        roundMatches: [match()],
        players,
        standings: [
            { playerId: "p2", matchPoints: 6, wins: 2, losses: 0, draws: 0 },
            { playerId: "p1", matchPoints: 4, wins: 1, losses: 0, draws: 1 },
            { playerId: "p3", matchPoints: 0, wins: 0, losses: 2, draws: 0 },
        ],
        me,
        ...overrides,
    };
}

describe("état d'un joueur dans un tournoi (MCP)", () => {
    it("donne la ronde, la table, l'adversaire, le classement et les rondes prévues", () => {
        const text = describeTournamentStatus(input());
        assert.match(text, /Ronde 3 sur 5 de la phase Suisse \(en cours\)/);
        assert.match(text, /Table 7\. Adversaire : Alice#4242 \(1er, 6 pts, 2V\/0D\)\. Match : à jouer\./);
        assert.match(text, /Classement : 2e sur 3, 4 points \(1V\/0D\/1N\)/);
        assert.match(text, /- Suisse \(rondes suisses\) — 5 rondes prévues, en cours/);
        assert.match(text, /- Top 8 \(arbre à élimination directe, top 8\) — 3 rondes jusqu'à la finale, à venir/);
    });

    it("annonce le résultat d'un match rapporté", () => {
        const text = describeTournamentStatus(input({
            roundMatches: [match({
                status: "completed",
                winnerIds: ["p1"],
                players: [{ playerId: "p1", score: 2 }, { playerId: "p2", score: 1 }],
                games: [{ winnerId: "p1" }, { winnerId: "p2" }, { winnerId: "p1" }],
            })],
        }));
        assert.match(text, /Match : victoire 2-1\./);
    });

    it("signale un BYE", () => {
        const text = describeTournamentStatus(input({
            roundMatches: [match({ players: [{ playerId: "p1", score: 0 }], tableNumber: undefined })],
        }));
        assert.match(text, /BYE/);
    });

    it("donne la table attribuée en phase contre la montre", () => {
        const race = phase({ type: "time-race", name: "Puzzle", plannedRounds: undefined });
        const text = describeTournamentStatus(input({ activePhase: race, phases: [race], roundMatches: [], puzzleSeat: { tableNumber: 4 } }));
        assert.match(text, /contre la montre, sans adversaire\. Votre table : 4\./);
    });

    it("parle au staff sans lui inventer de table", () => {
        const text = describeTournamentStatus(input({ me: null }));
        assert.match(text, /pas inscrit comme joueur/);
        assert.doesNotMatch(text, /Table 7/);
    });

    it("dit quand aucune ronde n'est lancée", () => {
        const text = describeTournamentStatus(input({ currentRound: null, roundMatches: [] }));
        assert.match(text, /aucune ronde lancée pour l'instant \(5 rondes prévues\)/);
        assert.match(text, /Pas encore de table/);
    });

    it("accorde « ronde » au singulier", () => {
        assert.equal(plannedRoundsLabel(phase({ plannedRounds: 1 })), "1 ronde prévue");
    });

    it("dit quand l'organisation n'a pas fixé le nombre de rondes", () => {
        assert.equal(plannedRoundsLabel(phase({ plannedRounds: undefined })), "nombre de rondes non fixé par l'organisation");
    });
});
