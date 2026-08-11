import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TABLE,
  MAX_SNAPSHOTS,
  MAX_TABLE_SIDE,
  MIN_TABLE_SIDE,
  PLAYER_COLORS,
  colorForPlayer,
  defaultTableForGame,
  emptyBattleMap,
  isEmptyBattleMap,
  normalizeBattleMap,
  normalizeColor,
  normalizeTable,
  playerColorAt,
  trianglePoints,
} from "./battle-map";
import type { BattleMap } from "@/lib/types/Match";

/**
 * Tests de la table de jeu. Ce qui compte ici, c'est qu'une table relue plus
 * tard — rétrécie entre-temps, amputée d'un joueur, ou remplie par une souris
 * qui a glissé — reste une table lisible, et non un plateau dont la moitié des
 * jetons a disparu dans le vide.
 *
 * Exécution : `npm run test`.
 */

const table = { width: 90, height: 90 };

const mapWith = (partial: Partial<BattleMap>): BattleMap => ({
  table,
  terrain: [],
  snapshots: [],
  ...partial,
});

const token = (overrides: Partial<BattleMap["snapshots"][number]["units"][number]> = {}) => ({
  id: "t1",
  playerId: "alice",
  unitName: "Vader",
  x: 10,
  y: 10,
  diameter: 4,
  ...overrides,
});

describe("defaultTableForGame", () => {
  it("rend 90 × 90 cm pour Shatterpoint", () => {
    assert.deepEqual(defaultTableForGame("shatterpoint"), { width: 90, height: 90 });
  });

  it("retombe sur la table par défaut pour un jeu sans réglage", () => {
    assert.deepEqual(defaultTableForGame("un-jeu-sans-preset"), DEFAULT_TABLE);
    assert.deepEqual(defaultTableForGame(undefined), DEFAULT_TABLE);
  });
});

describe("normalizeTable", () => {
  it("ramène les dimensions dans les bornes", () => {
    assert.deepEqual(normalizeTable({ width: 5, height: 10_000 }), {
      width: MIN_TABLE_SIDE,
      height: MAX_TABLE_SIDE,
    });
  });

  it("remplace une dimension absurde par la table par défaut", () => {
    assert.equal(normalizeTable({ width: Number.NaN, height: 90 }).width, MIN_TABLE_SIDE);
  });
});

describe("normalizeColor", () => {
  it("accepte un hexadécimal complet, en minuscules", () => {
    assert.equal(normalizeColor("#AABBCC", "#000000"), "#aabbcc");
  });

  it("retombe sur la couleur de repli pour tout le reste", () => {
    for (const invalid of ["rouge", "#abc", "", undefined, "javascript:alert(1)"]) {
      assert.equal(normalizeColor(invalid, "#000000"), "#000000");
    }
  });
});

describe("normalizeBattleMap", () => {
  it("ramène sur la table un jeton posé au-delà du bord", () => {
    const map = normalizeBattleMap(
      mapWith({ snapshots: [{ id: "s1", label: "Début", units: [token({ x: 500, y: -40 })] }] }),
      ["alice"]
    );

    assert.deepEqual(
      { x: map.snapshots[0].units[0].x, y: map.snapshots[0].units[0].y },
      { x: 90, y: 0 }
    );
  });

  it("abandonne les jetons d'un joueur qui n'est plus dans la partie", () => {
    const map = normalizeBattleMap(
      mapWith({
        snapshots: [
          { id: "s1", label: "Début", units: [token(), token({ id: "t2", playerId: "bob" })] },
        ],
      }),
      ["alice"]
    );

    assert.deepEqual(map.snapshots[0].units.map((unit) => unit.id), ["t1"]);
  });

  it("écarte les doublons d'identifiant, en gardant le premier", () => {
    const map = normalizeBattleMap(
      mapWith({
        snapshots: [
          { id: "s1", label: "Début", units: [token({ x: 10 }), token({ x: 80 })] },
        ],
      }),
      ["alice"]
    );

    assert.equal(map.snapshots[0].units.length, 1);
    assert.equal(map.snapshots[0].units[0].x, 10);
  });

  it("plafonne le nombre d'instants", () => {
    const snapshots = Array.from({ length: MAX_SNAPSHOTS + 4 }, (_, index) => ({
      id: `s${index}`,
      label: `Instant ${index}`,
      units: [],
    }));

    assert.equal(normalizeBattleMap(mapWith({ snapshots }), []).snapshots.length, MAX_SNAPSHOTS);
  });

  it("borne une pièce de décor à la taille de la table et garde son centre dessus", () => {
    const map = normalizeBattleMap(
      mapWith({
        terrain: [
          { id: "d1", shape: "rectangle", color: "#000000", x: 200, y: 45, width: 900, height: 10 },
        ],
      }),
      []
    );

    assert.deepEqual(
      { x: map.terrain[0].x, width: map.terrain[0].width },
      { x: 90, width: 90 }
    );
  });

  it("remplace une couleur de décor invalide par le noir", () => {
    const map = normalizeBattleMap(
      mapWith({
        terrain: [{ id: "d1", shape: "circle", color: "url(#x)", x: 10, y: 10, width: 20, height: 20 }],
      }),
      []
    );

    assert.equal(map.terrain[0].color, "#000000");
  });

  it("ne garde les couleurs que des joueurs de la partie", () => {
    const map = normalizeBattleMap(
      mapWith({ playerColors: { alice: "#123456", bob: "#654321" } }),
      ["alice"]
    );

    assert.deepEqual(map.playerColors, { alice: "#123456" });
  });

  it("donne un nom aux instants laissés sans titre", () => {
    const map = normalizeBattleMap(
      mapWith({ snapshots: [{ id: "s1", label: "   ", units: [] }] }),
      []
    );

    assert.equal(map.snapshots[0].label, "Instant 1");
  });
});

describe("emptyBattleMap", () => {
  it("part de la table du jeu, avec un premier instant nommé", () => {
    const map = emptyBattleMap("shatterpoint", "s1", ["alice", "bob"]);

    assert.deepEqual(map.table, { width: 90, height: 90 });
    assert.deepEqual(map.snapshots.map((snapshot) => snapshot.label), ["Début de partie"]);
    assert.equal(isEmptyBattleMap(map), true);
  });

  it("distribue une couleur distincte à chaque joueur", () => {
    const map = emptyBattleMap("shatterpoint", "s1", ["alice", "bob"]);

    assert.equal(map.playerColors?.alice, PLAYER_COLORS[0]);
    assert.equal(map.playerColors?.bob, PLAYER_COLORS[1]);
  });

  it("recommence la palette au-delà de son dernier ton", () => {
    assert.equal(playerColorAt(PLAYER_COLORS.length), PLAYER_COLORS[0]);
  });
});

describe("colorForPlayer", () => {
  it("préfère la couleur choisie à celle du rang", () => {
    assert.equal(colorForPlayer({ playerColors: { alice: "#123456" } }, "alice", 1), "#123456");
  });

  it("retombe sur la couleur du rang quand rien n'a été choisi", () => {
    assert.equal(colorForPlayer({}, "alice", 1), PLAYER_COLORS[1]);
  });
});

describe("trianglePoints", () => {
  it("inscrit le triangle dans sa boîte, pointe en haut", () => {
    assert.equal(
      trianglePoints({ x: 50, y: 50, width: 20, height: 10 }),
      "50,45 60,55 40,55"
    );
  });
});
