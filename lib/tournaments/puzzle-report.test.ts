import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planPuzzleReport, type PuzzleReportActor } from "./puzzle-report";

/**
 * Tests du relevé de fin de puzzle.
 *
 * Exécution : `npm run test`.
 */

const player: PuzzleReportActor = { playerIds: ["p1"], isOrganizer: false };
const organizer: PuzzleReportActor = { playerIds: [], isOrganizer: true };
const playingOrganizer: PuzzleReportActor = { playerIds: ["p9"], isOrganizer: true };
const open = { allowSelfReporting: true };

describe("planPuzzleReport", () => {
  it("vise l'inscription de l'auteur quand la requête ne désigne personne", () => {
    assert.deepEqual(planPuzzleReport({}, player, open), {
      ok: true,
      playerId: "p1",
      selfReported: true,
      overwrite: false,
    });
  });

  it("laisse l'organisation relever le temps du joueur qu'elle désigne", () => {
    assert.deepEqual(planPuzzleReport({ playerId: "p1", durationSeconds: 300 }, organizer, open), {
      ok: true,
      playerId: "p1",
      selfReported: false,
      overwrite: true,
    });
  });

  it("vise l'inscription de l'organisation qui joue et se signale sans désigner", () => {
    // Le cas qui rendait la route inutilisable depuis le portail joueur : le
    // rôle d'organisation ne doit pas priver de son propre « j'ai terminé ».
    assert.deepEqual(planPuzzleReport({}, playingOrganizer, open), {
      ok: true,
      playerId: "p9",
      selfReported: true,
      overwrite: false,
    });
  });

  it("ne réécrit pas le temps de l'organisation qui se signale comme joueuse", () => {
    const plan = planPuzzleReport({}, playingOrganizer, open);
    assert.equal(plan.ok && plan.overwrite, false);
  });

  it("refuse un temps saisi par l'organisation sans joueur désigné", () => {
    // Le rattrapage d'un relevé manqué nomme son joueur : sans lui, le temps
    // choisi s'inscrirait sous l'étiquette du self-report.
    assert.deepEqual(planPuzzleReport({ durationSeconds: 300 }, playingOrganizer, open), {
      ok: false,
      kind: "invalid",
      message: "Un temps saisi doit désigner le joueur auquel il s'applique",
    });
  });

  it("laisse l'organisation se désigner elle-même pour corriger son temps", () => {
    assert.deepEqual(
      planPuzzleReport({ playerId: "p9", durationSeconds: 300 }, playingOrganizer, open),
      { ok: true, playerId: "p9", selfReported: false, overwrite: true }
    );
  });

  it("refuse le self-reporting quand le tournoi le désactive", () => {
    assert.deepEqual(planPuzzleReport({}, player, { allowSelfReporting: false }), {
      ok: false,
      kind: "forbidden",
      message: "Le self-reporting est désactivé sur ce tournoi : voyez l'organisation",
    });
  });

  it("laisse l'organisation relever un temps même sans self-reporting", () => {
    const plan = planPuzzleReport({}, playingOrganizer, { allowSelfReporting: false });
    assert.equal(plan.ok && plan.playerId, "p9");
  });

  it("refuse qu'un joueur rapporte le temps d'un autre", () => {
    const plan = planPuzzleReport({ playerId: "p2" }, player, open);
    assert.deepEqual(plan, {
      ok: false,
      kind: "forbidden",
      message: "Vous ne pouvez rapporter que votre propre temps",
    });
  });

  it("refuse qu'un joueur choisisse son temps", () => {
    const plan = planPuzzleReport({ durationSeconds: 42 }, player, open);
    assert.equal(plan.ok, false);
    assert.equal(
      !plan.ok && plan.message,
      "Seule l'organisation peut saisir un temps : signalez simplement la fin du puzzle"
    );
  });

  it("refuse la requête d'une organisation non inscrite qui ne désigne personne", () => {
    assert.deepEqual(planPuzzleReport({}, organizer, open), {
      ok: false,
      kind: "invalid",
      message: "Aucun joueur désigné, et vous n'êtes pas inscrit à ce tournoi",
    });
  });

  it("refuse la requête d'un spectateur sans inscription", () => {
    const plan = planPuzzleReport({}, { playerIds: [], isOrganizer: false }, open);
    assert.equal(!plan.ok && plan.kind, "invalid");
  });
});
