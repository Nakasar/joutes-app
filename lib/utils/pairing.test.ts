import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateStandings,
  generateSwissPairings,
  pickByePlayer,
  type PairingMatch,
} from "./pairing";

/**
 * Tests de l'appariement suisse. Ce module est pur : c'est le seul endroit où
 * une erreur d'appariement peut être constatée avant qu'un organisateur ne la
 * découvre en salle, une ronde déjà générée.
 *
 * Exécution : `npm run test`.
 */

function completedMatch(
  matchId: string,
  player1Id: string,
  player2Id: string | null,
  winnerId: string | null
): PairingMatch {
  return {
    matchId,
    player1Id,
    player2Id,
    player1Score: winnerId === player1Id ? 1 : 0,
    player2Score: winnerId === player2Id ? 1 : 0,
    winnerId,
    status: "completed",
  };
}

describe("pickByePlayer", () => {
  it("donne le bye au moins bien classé", () => {
    assert.equal(pickByePlayer(["a", "b", "c"], new Set()), "c");
  });

  it("saute les joueurs ayant déjà reçu un bye", () => {
    assert.equal(pickByePlayer(["a", "b", "c"], new Set(["c"])), "b");
    assert.equal(pickByePlayer(["a", "b", "c"], new Set(["b", "c"])), "a");
  });

  it("retombe sur le moins bien classé quand tout le monde en a eu un", () => {
    assert.equal(pickByePlayer(["a", "b", "c"], new Set(["a", "b", "c"])), "c");
  });

  it("renvoie null sans joueur", () => {
    assert.equal(pickByePlayer([], new Set()), null);
  });
});

describe("generateSwissPairings", () => {
  it("apparie tout le monde en ronde 1 et n'oublie personne", () => {
    const players = ["a", "b", "c", "d", "e"];
    const pairings = generateSwissPairings(players, [], 1);

    const paired = pairings.flatMap((p) => [p.player1Id, p.player2Id]).filter(Boolean);
    assert.deepEqual([...paired].sort(), [...players].sort());
    assert.equal(pairings.filter((p) => p.player2Id === null).length, 1);
  });

  it("ne redonne pas le bye au même joueur", () => {
    const players = ["a", "b", "c", "d", "e"];
    // Ronde 1 : « e » a eu le bye et a donc 3 points, les autres 3 ou 0.
    const matches = [
      completedMatch("m1", "a", "b", "a"),
      completedMatch("m2", "c", "d", "c"),
      completedMatch("m3", "e", null, "e"),
    ];

    const pairings = generateSwissPairings(players, matches, 2, {
      playersWithBye: new Set(["e"]),
    });

    const bye = pairings.find((p) => p.player2Id === null);
    assert.ok(bye, "une ronde à 5 joueurs doit comporter un bye");
    assert.notEqual(bye.player1Id, "e");
  });

  it("donne le bye au moins bien classé quand personne n'en a eu", () => {
    const players = ["a", "b", "c"];
    const matches = [completedMatch("m1", "a", "b", "a")];
    // Classement : a (3 pts), puis b et c (0 pt) — « c » n'a pas joué et se
    // retrouve dernier à égalité de points.
    const ranked = calculateStandings(players, matches).map((s) => s.playerId);

    const pairings = generateSwissPairings(players, matches, 2, {
      rankedOrder: ranked,
      playersWithBye: new Set(),
    });

    const bye = pairings.find((p) => p.player2Id === null);
    assert.ok(bye);
    assert.equal(bye.player1Id, ranked[ranked.length - 1]);
  });

  it("évite de rejouer le même adversaire", () => {
    const players = ["a", "b", "c", "d"];
    const matches = [
      completedMatch("m1", "a", "b", "a"),
      completedMatch("m2", "c", "d", "c"),
    ];

    const pairings = generateSwissPairings(players, matches, 2, {
      rankedOrder: ["a", "c", "b", "d"],
    });

    for (const pairing of pairings) {
      const pair = [pairing.player1Id, pairing.player2Id].sort().join("-");
      assert.notEqual(pair, "a-b");
      assert.notEqual(pair, "c-d");
    }
  });

  it("tire au sort dans un groupe de points sans mélanger les groupes", () => {
    const players = ["w1", "w2", "w3", "w4", "l1", "l2", "l3", "l4"];
    const matches = [
      completedMatch("m1", "w1", "l1", "w1"),
      completedMatch("m2", "w2", "l2", "w2"),
      completedMatch("m3", "w3", "l3", "w3"),
      completedMatch("m4", "w4", "l4", "w4"),
    ];
    const matchPointsOf = (playerId: string) => (playerId.startsWith("w") ? 3 : 0);

    // Sur plusieurs tirages, les vainqueurs doivent toujours s'affronter entre
    // eux — le hasard joue à l'intérieur du groupe, pas entre les groupes.
    const seenPairs = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const pairings = generateSwissPairings(players, matches, 2, {
        rankedOrder: players,
        mode: "random-in-bracket",
        matchPointsOf,
      });
      for (const pairing of pairings) {
        assert.ok(pairing.player2Id, "aucun bye attendu à 8 joueurs");
        assert.equal(
          matchPointsOf(pairing.player1Id),
          matchPointsOf(pairing.player2Id),
          "un groupe de points ne doit pas déborder sur le suivant"
        );
        seenPairs.add([pairing.player1Id, pairing.player2Id].sort().join("-"));
      }
    }

    // Deux appariements possibles au moins par groupe : le tirage doit en
    // produire plus que les 4 paires d'un appariement figé par le classement.
    assert.ok(seenPairs.size > 4, `appariement figé (${seenPairs.size} paires vues)`);
  });

  it("garde l'ordre du classement en mode « ranked »", () => {
    const players = ["a", "b", "c", "d"];
    const pairings = generateSwissPairings(players, [], 2, {
      rankedOrder: ["a", "b", "c", "d"],
      mode: "ranked",
    });

    assert.deepEqual(
      pairings.map((p) => [p.player1Id, p.player2Id]),
      [
        ["a", "b"],
        ["c", "d"],
      ]
    );
  });
});
