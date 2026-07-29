import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_FIXED_SCORING, type TournamentMatch } from "@/lib/types/Tournament";
import { getPreset } from "@/lib/tournaments/game-presets";
import { calculateMultiplayerStandings, type MatchScoring } from "@/lib/tournaments/standings";

/**
 * Tests du classement. Deux règles s'y jouent qui ne se voient pas à l'œil nu :
 * la double défaite, qui ressemble à un match nul dans le document, et les
 * statistiques de bye, qui créditent un joueur n'ayant pas joué.
 *
 * Exécution : `npm run test`.
 */

const SCORING: MatchScoring = {
  method: "fixed",
  fixed: DEFAULT_FIXED_SCORING,
  rankOffsets: [],
};

const swpPreset = getPreset("swp-league");

function match(overrides: Partial<TournamentMatch> & Pick<TournamentMatch, "players">): TournamentMatch {
  return {
    id: overrides.id ?? "m1",
    tournamentId: "t1",
    phaseId: "p1",
    roundId: "r1",
    games: [],
    winnerIds: [],
    status: "completed",
    createdAt: new Date(0),
    ...overrides,
  };
}

function standingOf(standings: ReturnType<typeof calculateMultiplayerStandings>, playerId: string) {
  const found = standings.find((s) => s.playerId === playerId);
  assert.ok(found, `classement absent pour ${playerId}`);
  return found;
}

describe("calculateMultiplayerStandings", () => {
  it("distingue la double défaite du match nul", () => {
    const drawn = calculateMultiplayerStandings(
      ["a", "b"],
      [match({ players: [{ playerId: "a", score: 0 }, { playerId: "b", score: 0 }] })],
      () => SCORING
    );
    assert.equal(standingOf(drawn, "a").draws, 1);
    assert.equal(standingOf(drawn, "a").matchPoints, DEFAULT_FIXED_SCORING.draw);

    const doubleLoss = calculateMultiplayerStandings(
      ["a", "b"],
      [
        match({
          players: [{ playerId: "a", score: 0 }, { playerId: "b", score: 0 }],
          resolution: "double-loss",
        }),
      ],
      () => SCORING
    );
    for (const playerId of ["a", "b"]) {
      const standing = standingOf(doubleLoss, playerId);
      assert.equal(standing.draws, 0, "une double défaite n'est pas un nul");
      assert.equal(standing.losses, 1);
      assert.equal(standing.matchPoints, DEFAULT_FIXED_SCORING.loss);
    }
  });

  it("crédite les statistiques de bye au joueur exempté", () => {
    const standings = calculateMultiplayerStandings(
      ["a"],
      [match({ players: [{ playerId: "a", score: 1 }], winnerIds: ["a"] })],
      () => SCORING,
      swpPreset
    );

    const standing = standingOf(standings, "a");
    assert.equal(standing.wins, 1);
    assert.equal(standing.stats?.struggles, 2);
    assert.equal(standing.stats?.wounds, 3);
  });

  it("crédite les mêmes statistiques au vainqueur par forfait", () => {
    const standings = calculateMultiplayerStandings(
      ["a", "b"],
      [
        match({
          players: [{ playerId: "a", score: 1 }, { playerId: "b", score: 0 }],
          winnerIds: ["a"],
          resolution: "forfeit",
        }),
      ],
      () => SCORING,
      swpPreset
    );

    assert.equal(standingOf(standings, "a").stats?.struggles, 2);
    assert.equal(standingOf(standings, "a").stats?.wounds, 3);
    assert.equal(standingOf(standings, "b").stats?.struggles, 0);
    assert.equal(standingOf(standings, "b").losses, 1);
  });

  it("cumule les statistiques des parties jouées", () => {
    const standings = calculateMultiplayerStandings(
      ["a", "b"],
      [
        match({
          players: [{ playerId: "a", score: 1 }, { playerId: "b", score: 0 }],
          winnerIds: ["a"],
          games: [
            {
              winnerId: "a",
              stats: {
                a: { struggles: 2, wounds: 5 },
                b: { struggles: 1, wounds: 3 },
              },
            },
          ],
        }),
      ],
      () => SCORING,
      swpPreset
    );

    assert.equal(standingOf(standings, "a").stats?.wounds, 5);
    assert.equal(standingOf(standings, "b").stats?.wounds, 3);
  });

  it("départage par cartes de lutte puis par blessures", () => {
    // Deux joueurs à 3 points chacun (une victoire), départagés uniquement par
    // les statistiques : « b » a moins de cartes de lutte mais plus de
    // blessures, ce qui ne doit pas suffire à le faire passer devant.
    const matches: TournamentMatch[] = [
      match({
        id: "m1",
        players: [{ playerId: "a", score: 1 }, { playerId: "x", score: 0 }],
        winnerIds: ["a"],
        games: [{ winnerId: "a", stats: { a: { struggles: 2, wounds: 4 }, x: { struggles: 0, wounds: 1 } } }],
      }),
      match({
        id: "m2",
        players: [{ playerId: "b", score: 1 }, { playerId: "y", score: 0 }],
        winnerIds: ["b"],
        games: [{ winnerId: "b", stats: { b: { struggles: 1, wounds: 9 }, y: { struggles: 0, wounds: 2 } } }],
      }),
    ];

    const standings = calculateMultiplayerStandings(["a", "b", "x", "y"], matches, () => SCORING, swpPreset);
    const order = standings.map((s) => s.playerId);
    assert.ok(order.indexOf("a") < order.indexOf("b"), `a doit précéder b (ordre : ${order.join(", ")})`);
  });

  it("garde les départages historiques sans preset", () => {
    const standings = calculateMultiplayerStandings(
      ["a", "b"],
      [
        match({
          players: [{ playerId: "a", score: 2 }, { playerId: "b", score: 1 }],
          winnerIds: ["a"],
        }),
      ],
      () => SCORING
    );

    assert.equal(standingOf(standings, "a").stats, undefined);
    assert.equal(standings[0].playerId, "a");
  });
});
