import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { playerColor, splitTold, toldIndex } from "./told-text.ts";

const index = toldIndex(
  [
    { seat: 0, name: "Vous" },
    { seat: 1, name: "Robot" },
  ],
  [
    { code: "OGN-001", name: "Ahri" },
    { code: "OGN-002", name: "Ahri, Alluring" },
    { code: "OGN-003", name: "The Grand Plaza" },
    { code: "OGN-004", name: "Yi" },
    { code: "OGN-005", name: "Robot" },
  ],
);

describe("noms dans le journal", () => {
  it("repère joueurs et cartes, le nom le plus long d'abord", () => {
    assert.deepEqual(splitTold("Robot déplace Ahri, Alluring vers The Grand Plaza.", index), [
      { kind: "player", text: "Robot", seat: 1 },
      { kind: "text", text: " déplace " },
      { kind: "card", text: "Ahri, Alluring", code: "OGN-002" },
      { kind: "text", text: " vers " },
      { kind: "card", text: "The Grand Plaza", code: "OGN-003" },
      { kind: "text", text: "." },
    ]);
  });

  it("ne repère qu'un nom entier, et pas les noms trop courts", () => {
    assert.deepEqual(splitTold("Ahrimane et Yi passent.", index), [{ kind: "text", text: "Ahrimane et Yi passent." }]);
  });

  it("garde le joueur quand une carte porte son nom", () => {
    assert.deepEqual(splitTold("Robot", index), [{ kind: "player", text: "Robot", seat: 1 }]);
  });

  it("donne une couleur à chaque joueur", () => {
    assert.equal(playerColor(0, 0, [0, 1, 2]), "#2bb7dc");
    assert.notEqual(playerColor(1, 0, [0, 1, 2]), playerColor(2, 0, [0, 1, 2]));
    assert.equal(playerColor(0, null, [0, 1]), "#2bb7dc");
  });
});
