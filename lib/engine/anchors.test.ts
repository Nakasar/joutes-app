import { test } from "node:test";
import assert from "node:assert/strict";

import { anchorOf, mulliganChoice, mulliganLimit, sortChoices } from "./anchors.ts";
import type { EngineChoice, EngineObj, EngineView } from "./types.ts";

function obj(id: number): EngineObj {
  return {
    id,
    code: "OGN-001",
    name: "Carte",
    owner: 0,
    controller: 0,
    zone: "Hand",
    token: false,
    exhausted: false,
    damage: 0,
    buffs: 0,
    stunned: false,
    might: null,
    keywords: [],
    role: null,
  };
}

function view(hand: number[]): EngineView {
  return {
    mode: "duel",
    turn: 1,
    turn_seat: 0,
    step: "Main",
    victory_score: 8,
    points: [0, 0],
    players: [
      {
        seat: 0,
        name: "A",
        team: 0,
        alive: true,
        points: 0,
        hand_count: hand.length,
        hand: hand.map(obj),
        deck_count: 30,
        rune_deck_count: 10,
        trash: [obj(90)],
        banish: [],
        pool: { energy: 0, power: [0, 0, 0, 0, 0, 0] },
        legend: obj(1),
        champion: obj(2),
        runes_ready: 0,
        runes_exhausted: 0,
      },
    ],
    battlefields: [{ index: 0, card: obj(50), controller: null, contested_by: null, units: [obj(60)], facedown: [] }],
    bases: [[obj(70)]],
    chain: [],
    showdown: null,
    pending: null,
    result: null,
  };
}

const choice = (action: EngineChoice["action"], label = "x"): EngineChoice => ({ action, label });

test("anchorOf accroche chaque action à ce qu'elle désigne", () => {
  assert.deepEqual(anchorOf({ type: "play", card: 4 }), { on: "obj", id: 4 });
  assert.deepEqual(anchorOf({ type: "activate", source: 5, ability: 0 }), { on: "obj", id: 5 });
  assert.deepEqual(anchorOf({ type: "pick_loc", loc: { Bf: 1 } }), { on: "bf", index: 1 });
  assert.deepEqual(anchorOf({ type: "pick_loc", loc: { Base: 0 } }), { on: "base", seat: 0 });
  assert.deepEqual(anchorOf({ type: "pick_seat", seat: 1 }), { on: "seat", seat: 1 });
  assert.equal(anchorOf({ type: "pass" }), null);
  assert.equal(anchorOf({ type: "pick_option", index: 0 }), null);
});

test("sortChoices regroupe les choix d'une même carte et garde en boutons ce qui n'est pas dessiné", () => {
  const sorted = sortChoices(
    [
      choice({ type: "play", card: 10 }, "Jouer"),
      choice({ type: "hide", card: 10, bf: 0 }, "Cacher"),
      choice({ type: "pick", obj: 90 }, "Carte de la défausse"),
      choice({ type: "pick", obj: 999 }, "Dessus du deck"),
      choice({ type: "end_turn" }, "Finir"),
      choice({ type: "pick_bf", bf: 0 }, "Ici"),
    ],
    view([10, 11]),
  );
  assert.deepEqual(
    sorted.anchored.get("obj:10")?.map((c) => c.label),
    ["Jouer", "Cacher"],
  );
  assert.equal(sorted.anchored.get("bf:0")?.length, 1);
  assert.deepEqual(
    sorted.buttons.map((c) => c.label),
    ["Carte de la défausse", "Dessus du deck", "Finir"],
  );
});

test("le mulligan retrouve la combinaison choisie, dans n'importe quel ordre", () => {
  const choices = [
    choice({ type: "mulligan", cards: [] }, "Garder"),
    choice({ type: "mulligan", cards: [10] }),
    choice({ type: "mulligan", cards: [10, 11] }, "Les deux"),
  ];
  assert.equal(mulliganLimit(choices), 2);
  assert.equal(mulliganChoice(choices, [])?.label, "Garder");
  assert.equal(mulliganChoice(choices, [11, 10])?.label, "Les deux");
  assert.equal(mulliganChoice(choices, [11]), null);
  assert.equal(sortChoices(choices, view([10, 11])).mulligan.length, 3);
});
