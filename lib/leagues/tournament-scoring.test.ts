import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Feat, PointsRules } from "@/lib/types/League";
import {
  computeTournamentLeagueContribution,
  type TournamentScoringFeatAward,
  type TournamentScoringPlayer,
} from "./tournament-scoring";

const TOURNAMENT = { name: "Coupe d'hiver" };

function rules(overrides: Partial<PointsRules> = {}): PointsRules {
  return {
    participation: 0,
    victory: 2,
    defeat: 0,
    draw: 1,
    rankPoints: [],
    rankPointsBeyond: 0,
    feats: [],
    ...overrides,
  };
}

function player(overrides: Partial<TournamentScoringPlayer> = {}): TournamentScoringPlayer {
  return {
    playerId: "p1",
    userId: "u1",
    displayName: "Alice",
    status: "registered",
    rank: 1,
    wins: 0,
    losses: 0,
    draws: 0,
    ...overrides,
  };
}

function award(overrides: Partial<TournamentScoringFeatAward> = {}): TournamentScoringFeatAward {
  return { id: "a1", playerId: "p1", featId: "f1", ...overrides };
}

function feat(overrides: Partial<Feat> = {}): Feat {
  return { id: "f1", title: "Beau geste", points: 3, ...overrides };
}

/** Somme des points crédités à un utilisateur. */
function totalFor(
  result: ReturnType<typeof computeTournamentLeagueContribution>,
  userId: string
): number {
  return result.credits.find((credit) => credit.userId === userId)?.total ?? 0;
}

describe("points de classement", () => {
  it("suit la table des rangs", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ rankPoints: [10, 6, 3], rankPointsBeyond: 1 }),
      players: [
        player({ playerId: "p1", userId: "u1", rank: 1 }),
        player({ playerId: "p2", userId: "u2", displayName: "Bob", rank: 2 }),
        player({ playerId: "p3", userId: "u3", displayName: "Chloé", rank: 3 }),
      ],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u1"), 10);
    assert.equal(totalFor(result, "u2"), 6);
    assert.equal(totalFor(result, "u3"), 3);
  });

  it("retombe sur la valeur au-delà du tableau", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ rankPoints: [10], rankPointsBeyond: 1 }),
      players: [player({ playerId: "p7", userId: "u7", rank: 7 })],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u7"), 1);
  });

  it("ne distribue aucun point de rang sans table (ligue héritée)", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      // Barème d'avant les tournois rattachés : ni nul, ni table de rangs.
      rules: { participation: 1, victory: 2, defeat: 1, feats: [] } as unknown as PointsRules,
      players: [player({ rank: 1, wins: 3, losses: 1 })],
      featAwards: [],
    });

    const credit = result.credits[0];
    assert.equal(
      credit.lines.some((line) => line.kind === "rank"),
      false
    );
    // 3 victoires × 2 + 1 défaite × 1 + 4 matchs × 1 de participation.
    assert.equal(credit.total, 3 * 2 + 1 * 1 + 4 * 1);
  });

  it("libelle le rang en toutes lettres", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ rankPoints: [10, 6] }),
      players: [
        player({ playerId: "p1", userId: "u1", rank: 1 }),
        player({ playerId: "p2", userId: "u2", rank: 2 }),
      ],
      featAwards: [],
    });

    assert.equal(result.credits[0].lines[0].reason, "Tournoi « Coupe d'hiver » — 1er");
    assert.equal(result.credits[1].lines[0].reason, "Tournoi « Coupe d'hiver » — 2e");
  });
});

describe("bilan des matchs", () => {
  it("valorise victoires, nuls et défaites séparément", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ victory: 3, draw: 1, defeat: 0 }),
      players: [player({ wins: 2, draws: 1, losses: 1 })],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u1"), 2 * 3 + 1);
    assert.equal(result.credits[0].lines[0].reason, "Tournoi « Coupe d'hiver » — 2V/1N/1D");
  });

  it("ne rapporte rien pour un nul quand le barème hérité ne le connaît pas", () => {
    // `draw` absent en base : normalizePointsRules pose la valeur par défaut (1).
    const inherited = { participation: 0, victory: 2, defeat: 0, feats: [] } as unknown as PointsRules;
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: inherited,
      players: [player({ rank: undefined, draws: 2 })],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u1"), 2);
  });

  it("compte un BYE comme une victoire, comme au classement du tournoi", () => {
    // getStandings crédite déjà le BYE d'une victoire : la ligue reprend le
    // classement tel qu'il a été affiché plutôt que d'en inventer un autre.
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ victory: 2 }),
      players: [player({ rank: undefined, wins: 1 })],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u1"), 2);
  });

  it("compte la participation par match joué", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ participation: 1, victory: 0, defeat: 0, draw: 0 }),
      players: [player({ rank: undefined, wins: 2, losses: 1, draws: 1 })],
      featAwards: [],
    });

    assert.equal(totalFor(result, "u1"), 4);
    assert.equal(
      result.credits[0].lines[0].reason,
      "Tournoi « Coupe d'hiver » — participation (4 matchs)"
    );
  });

  it("accorde le singulier à un match unique", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ participation: 1, victory: 0 }),
      players: [player({ rank: undefined, wins: 1 })],
      featAwards: [],
    });

    assert.equal(
      result.credits[0].lines[0].reason,
      "Tournoi « Coupe d'hiver » — participation (1 match)"
    );
  });
});

describe("statuts des joueurs", () => {
  it("exclut un joueur pré-inscrit qui ne s'est pas présenté", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ participation: 5, rankPoints: [10] }),
      players: [player({ status: "pre-registered", rank: 1 })],
      featAwards: [],
    });

    assert.deepEqual(result.credits, []);
    assert.deepEqual(result.skippedPlayers, []);
    assert.equal(result.totalPoints, 0);
  });

  it("retire les points de rang à un joueur qui a abandonné mais garde son bilan", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ rankPoints: [10, 6, 3], victory: 2 }),
      players: [player({ status: "dropped", rank: 3, wins: 1, losses: 1 })],
      featAwards: [],
    });

    const credit = result.credits[0];
    assert.equal(
      credit.lines.some((line) => line.kind === "rank"),
      false
    );
    assert.equal(credit.total, 2);
  });

  it("signale l'invité sans compte au lieu de l'oublier", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ rankPoints: [10] }),
      players: [player({ playerId: "guest", userId: undefined, displayName: "Invité", rank: 1 })],
      featAwards: [],
    });

    assert.deepEqual(result.credits, []);
    assert.equal(result.skippedPlayers.length, 1);
    assert.equal(result.skippedPlayers[0].displayName, "Invité");
    assert.equal(result.skippedPlayers[0].wouldHaveScored, 10);
  });

  it("écarte un participant qui ne marque rien", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ victory: 0, defeat: 0, draw: 0 }),
      players: [player({ rank: undefined, losses: 3 })],
      featAwards: [],
    });

    assert.deepEqual(result.credits, []);
  });
});

describe("hauts faits", () => {
  it("crédite un haut fait attribué dans un match", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 3 })] }),
      players: [player({ rank: undefined })],
      featAwards: [award({ matchId: "m1" })],
    });

    const credit = result.credits[0];
    assert.equal(credit.total, 3);
    assert.equal(credit.feats.length, 1);
    assert.equal(credit.feats[0].tournamentMatchId, "m1");
    assert.equal(credit.lines[0].reason, "Haut fait: Beau geste (Tournoi « Coupe d'hiver »)");
  });

  it("applique maxPerEvent à l'intérieur d'un même match", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 1, maxPerEvent: 1 })] }),
      players: [player({ rank: undefined })],
      featAwards: [
        award({ id: "a1", matchId: "m1" }),
        award({ id: "a2", matchId: "m1" }),
      ],
    });

    assert.equal(totalFor(result, "u1"), 1);
    assert.equal(result.skippedFeats.length, 1);
    assert.equal(result.skippedFeats[0].reason, "max-per-event");
  });

  it("n'oppose pas maxPerEvent entre deux matchs différents", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 1, maxPerEvent: 1 })] }),
      players: [player({ rank: undefined })],
      featAwards: [
        award({ id: "a1", matchId: "m1" }),
        award({ id: "a2", matchId: "m2" }),
      ],
    });

    assert.equal(totalFor(result, "u1"), 2);
    assert.deepEqual(result.skippedFeats, []);
  });

  it("regroupe les attributions hors match dans une seule enveloppe", () => {
    // Depuis la fiche d'un joueur il n'y a pas de match : toutes ces
    // attributions partagent la limite « par match » du tournoi.
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 1, maxPerEvent: 1 })] }),
      players: [player({ rank: undefined })],
      featAwards: [award({ id: "a1" }), award({ id: "a2" })],
    });

    assert.equal(totalFor(result, "u1"), 1);
    assert.equal(result.skippedFeats[0].reason, "max-per-event");
  });

  it("tient compte des hauts faits déjà acquis dans la ligue", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 5, maxPerLeague: 2 })] }),
      players: [player({ rank: undefined })],
      featAwards: [
        award({ id: "a1", matchId: "m1" }),
        award({ id: "a2", matchId: "m2" }),
      ],
      existingFeatCounts: { u1: { f1: 1 } },
    });

    assert.equal(totalFor(result, "u1"), 5);
    assert.equal(result.skippedFeats.length, 1);
    assert.equal(result.skippedFeats[0].reason, "max-per-league");
  });

  it("ne partage pas les limites entre deux joueurs", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 2, maxPerLeague: 1 })] }),
      players: [
        player({ playerId: "p1", userId: "u1", rank: 1 }),
        player({ playerId: "p2", userId: "u2", displayName: "Bob", rank: 2 }),
      ],
      featAwards: [
        award({ id: "a1", playerId: "p1" }),
        award({ id: "a2", playerId: "p2" }),
      ],
    });

    assert.equal(totalFor(result, "u1"), 2);
    assert.equal(totalFor(result, "u2"), 2);
    assert.deepEqual(result.skippedFeats, []);
  });

  it("ignore un haut fait retiré du catalogue de la ligue", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [] }),
      players: [player({ rank: undefined })],
      featAwards: [award()],
    });

    assert.deepEqual(result.credits, []);
    assert.equal(result.skippedFeats[0].reason, "unknown-feat");
  });

  it("ne crédite pas un invité et signale son haut fait", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat()] }),
      players: [player({ playerId: "guest", userId: undefined, displayName: "Invité", rank: undefined })],
      featAwards: [award({ playerId: "guest" })],
    });

    assert.deepEqual(result.credits, []);
    assert.equal(result.skippedFeats.length, 1);
    assert.equal(result.skippedFeats[0].reason, "no-account");
  });

  it("ne laisse pas un invité consommer la limite d'un autre joueur", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules({ feats: [feat({ points: 2, maxPerLeague: 1 })] }),
      players: [
        player({ playerId: "guest", userId: undefined, displayName: "Invité", rank: 1 }),
        player({ playerId: "p2", userId: "u2", displayName: "Bob", rank: 2 }),
      ],
      featAwards: [
        award({ id: "a1", playerId: "guest" }),
        award({ id: "a2", playerId: "p2" }),
      ],
    });

    assert.equal(totalFor(result, "u2"), 2);
  });
});

describe("stabilité du calcul", () => {
  const input = {
    tournament: TOURNAMENT,
    rules: rules({
      participation: 1,
      victory: 3,
      draw: 1,
      defeat: 0,
      rankPoints: [10, 6, 3],
      rankPointsBeyond: 1,
      feats: [feat({ points: 2, maxPerLeague: 1 })],
    }),
    players: [
      player({ playerId: "p1", userId: "u1", rank: 1, wins: 3 }),
      player({ playerId: "p2", userId: "u2", displayName: "Bob", rank: 2, wins: 2, losses: 1 }),
      player({ playerId: "p3", userId: "u3", displayName: "Chloé", rank: 3, draws: 3 }),
    ],
    featAwards: [
      award({ id: "a2", playerId: "p2", matchId: "m1" }),
      award({ id: "a1", playerId: "p1", matchId: "m1" }),
    ],
  };

  it("rend le même résultat à chaque appel", () => {
    assert.deepEqual(
      computeTournamentLeagueContribution(input),
      computeTournamentLeagueContribution(input)
    );
  });

  it("ne dépend pas de l'ordre des entrées", () => {
    const shuffled = {
      ...input,
      players: [...input.players].reverse(),
      featAwards: [...input.featAwards].reverse(),
    };

    assert.deepEqual(
      computeTournamentLeagueContribution(shuffled),
      computeTournamentLeagueContribution(input)
    );
  });

  it("fait correspondre les totaux aux lignes", () => {
    const result = computeTournamentLeagueContribution(input);

    for (const credit of result.credits) {
      assert.equal(
        credit.total,
        credit.lines.reduce((sum, line) => sum + line.points, 0)
      );
    }
    assert.equal(
      result.totalPoints,
      result.credits.reduce((sum, credit) => sum + credit.total, 0)
    );
  });

  it("ne consomme pas deux fois la même limite d'une clôture à l'autre", () => {
    // Rejouer une clôture repart des hauts faits détenus *hors* de ce tournoi :
    // sinon la seconde application opposerait au joueur la limite que la
    // première lui a fait atteindre, et le haut fait disparaîtrait.
    const capped = { feats: [feat({ points: 4, maxPerLeague: 1 })] };
    const first = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules(capped),
      players: [player({ rank: undefined })],
      featAwards: [award()],
      existingFeatCounts: {},
    });
    const replayed = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules(capped),
      players: [player({ rank: undefined })],
      featAwards: [award()],
      existingFeatCounts: {},
    });

    assert.equal(totalFor(first, "u1"), 4);
    assert.deepEqual(replayed, first);
  });

  it("supporte un tournoi vide", () => {
    const result = computeTournamentLeagueContribution({
      tournament: TOURNAMENT,
      rules: rules(),
      players: [],
      featAwards: [],
    });

    assert.deepEqual(result.credits, []);
    assert.equal(result.totalPoints, 0);
  });
});
