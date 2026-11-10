import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { engineGameId, parseEngineResult, tableIdOfEngineGame } from "./results.ts";

describe("partie d'une table sur le serveur de parties", () => {
  it("retrouve la table depuis le nom de la partie", () => {
    assert.equal(tableIdOfEngineGame("bcdf2345-9f3a01bc"), "bcdf2345");
    assert.equal(tableIdOfEngineGame("bcdf2345"), "bcdf2345");
  });

  it("une table d'avant les noms de partie garde son code", () => {
    assert.equal(engineGameId({ id: "bcdf2345" }), "bcdf2345");
    assert.equal(engineGameId({ id: "bcdf2345", engineId: "bcdf2345-aa" }), "bcdf2345-aa");
  });
});

describe("résultat annoncé par le serveur de parties", () => {
  it("garde vainqueurs, raison, tours et points", () => {
    assert.deepEqual(parseEngineResult({ winners: [1], reason: "8 points" }, 12, [3, 8]), {
      winners: [1],
      reason: "8 points",
      turns: 12,
      points: [3, 8],
    });
  });

  it("accepte une égalité sans vainqueur", () => {
    assert.deepEqual(parseEngineResult({ winners: [], reason: "nulle" }, undefined, undefined), {
      winners: [],
      reason: "nulle",
    });
  });

  it("refuse une partie pas finie ou un résultat mal formé", () => {
    assert.equal(parseEngineResult(null, 3, [0, 0]), null);
    assert.equal(parseEngineResult({ winners: [0] }, 3, [0, 0]), null);
    assert.equal(parseEngineResult({ winners: [7], reason: "x" }, 3, [0, 0]), null);
    assert.equal(parseEngineResult({ winners: [-1], reason: "x" }, 3, [0, 0]), null);
    assert.equal(parseEngineResult({ winners: [0, 1, 2, 3, 0], reason: "x" }, 3, [0, 0]), null);
    assert.equal(parseEngineResult({ winners: "0", reason: "x" }, 3, [0, 0]), null);
  });

  it("borne la raison et ignore des points mal formés", () => {
    const result = parseEngineResult({ winners: [0], reason: "x".repeat(1000) }, "12", ["a"]);
    assert.equal(result?.reason.length, 300);
    assert.equal(result?.turns, undefined);
    assert.equal(result?.points, undefined);
  });
});
