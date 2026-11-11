import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ackAfter, battlefieldOf, combatInFocus, delayOf, diedIn, objectsOf, revealsCard, weightOf } from "./pacing.ts";
import type { EngineTold } from "./types.ts";

const told = (event: EngineTold["event"], text: string): EngineTold => ({ event, text, rule: null });

// Le tour 4 du robot (siège 1) contre moi (siège 0), tel que le moteur le raconte.
const turn3 = told({ type: "turn_started", seat: 0, turn: 3 }, "— Tour 3 : Vous —");
const turn4 = told({ type: "turn_started", seat: 1, turn: 4 }, "— Tour 4 : Robot —");
const channel = told({ type: "channeled", seat: 1, runes: [40, 41], exhausted: false }, "Robot canalise 2 runes.");
const played = told({ type: "played", seat: 1, obj: 12, def: 3, to: { Base: 1 }, from_hidden: false }, "Robot joue Jinx.");
const moved = told({ type: "moved", seat: 1, units: [12], to: { Bf: 0 } }, "Robot déplace Jinx vers Zaun.");
const combat = told({ type: "combat_started", bf: 0, attacker: 1, defender: 0 }, "Combat à Zaun : Robot attaque Vous.");
const damage = told({ type: "combat_damage", bf: 0, assigned: [[12, 3], [20, 5]] }, "Jinx inflige 5, Garen inflige 3.");
const died = told({ type: "died", unit: 20, def: 7, owner: 0 }, "Garen meurt.");
const scored = told({ type: "scored", seat: 1, bf: 0, kind: "conquer", point: true }, "Robot conquiert Zaun et gagne 1 point.");
const points = told({ type: "points", team: 1, total: 4 }, "  score de Robot : 4.");
const turn5 = told({ type: "turn_started", seat: 0, turn: 5 }, "— Tour 5 : Vous —");
const draw = told({ type: "drew", seat: 0, count: 1, cards: [55] }, "Vous piochez 1 carte.");

describe("rythme du récit", () => {
  it("pèse chaque évènement", () => {
    assert.equal(weightOf(channel), "minor");
    assert.equal(weightOf(moved), "normal");
    assert.equal(weightOf(played), "major");
  });

  it("raccourcit ses propres actions et suit la vitesse", () => {
    assert.equal(delayOf(played, 0, "normal"), 1500);
    assert.equal(delayOf(played, 1, "normal"), 750);
    assert.equal(delayOf(moved, 0, "slow"), 1440);
    assert.equal(delayOf(played, 0, "instant"), 0);
  });

  it("retrouve les objets et le champ de bataille concernés", () => {
    assert.deepEqual(objectsOf(played), [12]);
    assert.deepEqual(objectsOf(damage), [12, 20]);
    assert.equal(battlefieldOf(moved), 0);
    assert.equal(battlefieldOf(played), null);
    assert.deepEqual([...diedIn([damage, died])], [20]);
  });

  it("montre en grand la carte d'un adversaire, pas la mienne", () => {
    assert.equal(revealsCard(played, 0), true);
    assert.equal(revealsCard(played, 1), false);
  });
});

describe("moments clés", () => {
  const journal = [turn3, turn4, channel, played, moved, combat, damage, died, scored, points, turn5, draw];

  it("s'arrête sur une carte jouée par un adversaire", () => {
    const ack = ackAfter(journal, 3, 1, 4, 0);
    assert.equal(ack?.kind, "card");
    assert.equal(ack?.objId, 12);
    // Ma propre carte ne m'arrête pas.
    assert.equal(ackAfter(journal, 3, 1, 4, 1), null);
  });

  it("résume un combat à la fin de son lot, sans s'arrêter aussi sur les points", () => {
    assert.equal(ackAfter(journal, 8, 5, 10, 0), null);
    const ack = ackAfter(journal, 9, 5, 10, 0);
    assert.equal(ack?.kind, "combat");
    assert.equal(ack?.title, "Combat à Zaun : Robot attaque Vous.");
    assert.deepEqual(ack?.lines, ["Jinx inflige 5, Garen inflige 3.", "Garen meurt.", "Robot conquiert Zaun et gagne 1 point.", "score de Robot : 4."]);
  });

  it("s'arrête sur des points marqués hors combat", () => {
    const ack = ackAfter([turn4, scored, points], 1, 0, 3, 0);
    assert.equal(ack?.kind, "score");
    assert.deepEqual(ack?.lines, ["score de Robot : 4."]);
  });

  it("résume le tour adverse au début du mien", () => {
    const ack = ackAfter(journal, 11, 10, 12, 0);
    assert.equal(ack?.kind, "turn");
    assert.deepEqual(ack?.lines, ["Robot joue Jinx.", "Robot déplace Jinx vers Zaun.", "Garen meurt.", "Robot conquiert Zaun et gagne 1 point."]);
  });

  it("ne s'arrête pas au milieu d'un lot, ni pour un spectateur au début d'un tour", () => {
    assert.equal(ackAfter(journal, 10, 10, 12, 0), null);
    assert.equal(ackAfter(journal, 11, 10, 12, null), null);
  });

  it("ne s'arrête plus quand la partie est finie", () => {
    const end = told({ type: "game_ended", winners: [1], reason: "8 points" }, "Robot gagne.");
    assert.equal(ackAfter([played, end], 0, 0, 2, 0), null);
  });
});

describe("caméra sur les combats", () => {
  const later = told({ type: "moved", seat: 1, units: [13], to: { Bf: 1 } }, "Robot déplace Vi vers Piltover.");
  const journal = [turn4, channel, played, moved, combat, damage, died, scored, points, later, turn5];

  it("suit le combat de son début aux points qu'il rapporte", () => {
    assert.equal(combatInFocus(journal, { index: 3 }, null), null);
    for (const index of [4, 5, 6, 7, 8]) assert.equal(combatInFocus(journal, { index }, null), 0);
    assert.equal(combatInFocus(journal, { index: 9 }, null), null);
    assert.equal(combatInFocus(journal, { index: 10 }, null), null);
  });

  it("reste sur place pendant l'arrêt de fin de combat", () => {
    const ack = { at: 8, kind: "combat" as const, title: "", lines: [], objId: null };
    assert.equal(combatInFocus(journal, null, ack), 0);
  });

  it("ne remonte pas au combat d'un tour précédent", () => {
    assert.equal(combatInFocus([combat, damage, turn5, draw], { index: 3 }, null), null);
    assert.equal(combatInFocus(journal, null, null), null);
  });
});
