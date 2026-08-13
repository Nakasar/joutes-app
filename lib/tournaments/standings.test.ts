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
const battlePreset = getPreset("battle-points");

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

  it("départage les grandes armées par points, score de bataille, puis résistance", () => {
    // Chaîne complète du preset `battle-points` : les trois joueurs finissent à
    // une victoire et une défaite (3 points), « a » et « b » à égalité de score
    // de bataille — c'est alors la résistance qui tranche, en faveur de « a »
    // dont l'adversaire battu a mieux marché. « c », meilleur score de
    // destruction mais moins de score de bataille, reste derrière : la
    // destruction ne départage pas.
    const matches: TournamentMatch[] = [
      // « a » bat « strong » (qui gagne son autre match) ; « b » bat « weak ».
      match({
        id: "m1",
        players: [{ playerId: "a", score: 1 }, { playerId: "strong", score: 0 }],
        winnerIds: ["a"],
        games: [
          {
            winnerId: "a",
            stats: {
              a: { battlePoints: 80, pointsDestroyed: 900 },
              strong: { battlePoints: 60, pointsDestroyed: 700 },
            },
          },
        ],
      }),
      match({
        id: "m2",
        players: [{ playerId: "b", score: 1 }, { playerId: "weak", score: 0 }],
        winnerIds: ["b"],
        games: [
          {
            winnerId: "b",
            stats: {
              b: { battlePoints: 80, pointsDestroyed: 900 },
              weak: { battlePoints: 60, pointsDestroyed: 700 },
            },
          },
        ],
      }),
      match({
        id: "m3",
        players: [{ playerId: "c", score: 1 }, { playerId: "weak", score: 0 }],
        winnerIds: ["c"],
        games: [
          {
            winnerId: "c",
            stats: {
              c: { battlePoints: 70, pointsDestroyed: 2000 },
              weak: { battlePoints: 65, pointsDestroyed: 500 },
            },
          },
        ],
      }),
      // Les deux battus se départagent : « strong » gagne, « weak » perd tout.
      match({
        id: "m4",
        players: [{ playerId: "strong", score: 1 }, { playerId: "c", score: 0 }],
        winnerIds: ["strong"],
        games: [
          {
            winnerId: "strong",
            stats: {
              strong: { battlePoints: 90, pointsDestroyed: 1000 },
              c: { battlePoints: 30, pointsDestroyed: 400 },
            },
          },
        ],
      }),
      match({
        id: "m5",
        players: [{ playerId: "a", score: 0 }, { playerId: "b", score: 1 }],
        winnerIds: ["b"],
        games: [
          {
            winnerId: "b",
            stats: {
              a: { battlePoints: 20, pointsDestroyed: 300 },
              b: { battlePoints: 20, pointsDestroyed: 300 },
            },
          },
        ],
      }),
    ];

    const standings = calculateMultiplayerStandings(
      ["a", "b", "c", "strong", "weak"],
      matches,
      () => SCORING,
      battlePreset
    );
    const order = standings.map((s) => s.playerId);

    // « b » a deux victoires : les points de match passent avant tout le reste.
    assert.equal(order[0], "b", `ordre : ${order.join(", ")}`);
    // « a » et « c » sont à 3 points ; 100 points de bataille contre 100 aussi…
    assert.equal(standingOf(standings, "a").stats?.battlePoints, 100);
    assert.equal(standingOf(standings, "c").stats?.battlePoints, 100);
    // …et pourtant « a » passe devant : sa résistance est meilleure, quand la
    // destruction (2 400 contre 1 200 pour « c ») ne compte pas.
    assert.ok(
      standingOf(standings, "c").stats!.pointsDestroyed >
        standingOf(standings, "a").stats!.pointsDestroyed
    );
    assert.ok(order.indexOf("a") < order.indexOf("c"), `a doit précéder c (ordre : ${order.join(", ")})`);
  });

  it("applique la chaîne de départage de la phase plutôt que celle du preset", () => {
    // Deux joueurs à une victoire chacun : « a » a le meilleur score de
    // bataille, « b » le meilleur score de destruction. Le preset départage par
    // score de bataille ; l'organisateur qui préfère la destruction doit voir
    // l'ordre s'inverser, sans que rien d'autre ne bouge.
    const matches: TournamentMatch[] = [
      match({
        id: "m1",
        players: [{ playerId: "a", score: 1 }, { playerId: "x", score: 0 }],
        winnerIds: ["a"],
        games: [
          {
            winnerId: "a",
            stats: {
              a: { battlePoints: 80, pointsDestroyed: 500 },
              x: { battlePoints: 20, pointsDestroyed: 100 },
            },
          },
        ],
      }),
      match({
        id: "m2",
        players: [{ playerId: "b", score: 1 }, { playerId: "y", score: 0 }],
        winnerIds: ["b"],
        games: [
          {
            winnerId: "b",
            stats: {
              b: { battlePoints: 60, pointsDestroyed: 2000 },
              y: { battlePoints: 40, pointsDestroyed: 100 },
            },
          },
        ],
      }),
    ];
    const players = ["a", "b", "x", "y"];

    const official = calculateMultiplayerStandings(players, matches, () => SCORING, battlePreset)
      .map((s) => s.playerId);
    assert.ok(official.indexOf("a") < official.indexOf("b"), `ordre officiel : ${official.join(", ")}`);

    const custom = calculateMultiplayerStandings(players, matches, () => SCORING, battlePreset, [
      "stat:pointsDestroyed",
      "omw",
    ]).map((s) => s.playerId);
    assert.ok(custom.indexOf("b") < custom.indexOf("a"), `ordre choisi : ${custom.join(", ")}`);
  });

  it("crédite le barème plein de la mission au joueur exempté", () => {
    const standings = calculateMultiplayerStandings(
      ["a"],
      [match({ players: [{ playerId: "a", score: 1 }], winnerIds: ["a"] })],
      () => SCORING,
      battlePreset
    );

    const standing = standingOf(standings, "a");
    assert.equal(standing.wins, 1);
    assert.equal(standing.stats?.battlePoints, 100);
    assert.equal(standing.stats?.pointsDestroyed, 0);
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

  // Phase puzzle : aucun match, donc aucun point. Tout le classement repose
  // sur le chronomètre, et c'est le seul critère où « moins » vaut « mieux ».
  it("classe une phase de puzzle au temps, le plus rapide en tête", () => {
    const standings = calculateMultiplayerStandings(
      ["lent", "rapide", "moyen"],
      [],
      () => SCORING,
      undefined,
      undefined,
      { lent: 900, rapide: 120, moyen: 300 }
    );

    assert.deepEqual(
      standings.map((s) => s.playerId),
      ["rapide", "moyen", "lent"]
    );
    assert.equal(standingOf(standings, "rapide").puzzleTimeSeconds, 120);
  });

  it("place les joueurs sans temps derrière ceux qui ont terminé le puzzle", () => {
    const standings = calculateMultiplayerStandings(
      ["fini", "abandon"],
      [],
      () => SCORING,
      undefined,
      undefined,
      { fini: 600 }
    );

    assert.deepEqual(
      standings.map((s) => s.playerId),
      ["fini", "abandon"]
    );
    assert.equal(standingOf(standings, "abandon").puzzleTimeSeconds, undefined);
  });

  // Le temps ne départage qu'en dernier : il ne renverse jamais des points de
  // match gagnés dans une phase précédente du même tournoi.
  it("ne fait jouer le temps de puzzle qu'après les points de match", () => {
    const standings = calculateMultiplayerStandings(
      ["a", "b"],
      [
        match({
          players: [{ playerId: "a", score: 1 }, { playerId: "b", score: 0 }],
          winnerIds: ["a"],
        }),
      ],
      () => SCORING,
      undefined,
      undefined,
      { a: 900, b: 120 }
    );

    assert.equal(standings[0].playerId, "a");
  });
});
