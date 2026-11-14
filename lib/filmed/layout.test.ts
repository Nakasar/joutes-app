import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  areaAt,
  aroundBattlefields,
  battlefieldsOnTable,
  cardRange,
  cardWidth,
  codeOf,
  defaultLayout,
  doubtful,
  liveOverrides,
  spotted,
} from "./layout.ts";
import type { Found } from "./types.ts";

/** Une carte droite de 100 × 140 centrée en `at`. */
function card(id: string, at: [number, number], points = 20, angle = 0): Found {
  const [x, y] = at;
  return {
    id,
    points,
    seen: 1,
    sure: points >= 10,
    angle,
    at,
    quad: [
      [x - 50, y - 70],
      [x + 50, y - 70],
      [x + 50, y + 70],
      [x - 50, y + 70],
    ],
  };
}

describe("calibrage de la table filmée", () => {
  it("lit le code moteur d'une illustration", () => {
    assert.equal(codeOf("OGN-042#OGN042a"), "OGN-042");
    assert.equal(codeOf("OGN-042"), "OGN-042");
  });

  it("range le siège 0 en bas, ou à gauche si les joueurs sont sur les côtés", () => {
    const upright = defaultLayout(1920, 1080, false);
    assert.deepEqual(areaAt(upright, [400, 900])?.kind, "base");
    assert.equal(areaAt(upright, [400, 900])?.index, 0);
    assert.equal(areaAt(upright, [400, 150])?.index, 1);
    assert.equal(areaAt(upright, [600, 540])?.kind, "battlefield");
    assert.equal(areaAt(upright, [5, 5]), null);

    const sideways = defaultLayout(1920, 1080, true);
    const left = areaAt(sideways, [250, 400]);
    assert.equal(left?.kind, "base");
    assert.equal(left?.index, 0);
    assert.equal(areaAt(sideways, [1700, 400])?.index, 1);
    for (const area of sideways.areas) {
      const [x, y, w, h] = area.rect;
      assert.ok(x >= 0 && y >= 0 && x + w <= 1920 && y + h <= 1080, JSON.stringify(area));
    }
  });

  it("mesure la largeur d'une carte quel que soit son sens", () => {
    const found = [card("A", [100, 100]), card("B", [300, 100], 20, Math.PI / 2), card("C", [500, 100], 4)];
    assert.equal(cardWidth(found), 100);
    assert.equal(cardWidth([card("C", [0, 0], 4)]), null);
    assert.deepEqual(cardRange(100), { card_min: 72, card_max: 140 });
  });

  it("attribue un champ de bataille commun au joueur qui n'a que lui", () => {
    const lists = [
      ["SFD-207", "VEN-164", "VEN-166"],
      ["RAD-157", "SFD-207", "UNL-214"],
    ];
    const found = [card("SFD-207", [900, 300]), card("VEN-166", [900, 600]), card("OGN-042", [100, 100])];
    assert.deepEqual(battlefieldsOnTable(found, lists), ["VEN-166", "SFD-207"]);
    assert.deepEqual(battlefieldsOnTable([card("SFD-207", [900, 300])], lists), [null, null]);
  });

  it("pose la zone d'un champ de bataille autour de sa carte", () => {
    const layout = defaultLayout(1920, 1080, false);
    const moved = aroundBattlefields(layout, [card("VEN-166", [900, 600])], ["VEN-166", null], 100);
    const zone = moved.areas.find((area) => area.kind === "battlefield" && area.index === 0);
    assert.deepEqual(zone?.rect, [690, 480, 420, 240]);
    const other = moved.areas.find((area) => area.kind === "battlefield" && area.index === 1);
    assert.deepEqual(other, layout.areas.find((area) => area.kind === "battlefield" && area.index === 1));
  });

  it("ne donne au suivi que les cartes sûres ou tranchées par l'opérateur", () => {
    const layout = defaultLayout(1920, 1080, false);
    const found = [card("A", [400, 900]), card("B", [600, 900], 6), card("C", [800, 900], 7), card("D", [5, 5], 5)];
    assert.deepEqual(
      spotted(found, [], 100).map((one) => one.card),
      ["A"],
    );
    // B est confirmée sous un autre nom, C n'était pas une carte.
    const overrides = [
      { at: [610, 905] as [number, number], card: "Z" },
      { at: [800, 900] as [number, number], card: null },
    ];
    assert.deepEqual(
      spotted(found, overrides, 100).map((one) => one.card),
      ["A", "Z"],
    );
    // Hors de toute zone, une carte douteuse ne demande rien.
    assert.deepEqual(
      doubtful(found, [], layout, 100).map((one) => one.id),
      ["B", "C"],
    );
    assert.deepEqual(doubtful(found, overrides, layout, 100), []);
    // Une correction dont la carte a quitté l'image est oubliée.
    assert.equal(liveOverrides([card("A", [400, 900])], overrides, 100).length, 0);
  });
});
