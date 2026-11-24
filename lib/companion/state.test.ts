import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  changeMtgLife,
  cycleRiftboundControl,
  damageSwuBase,
  drawBattlefields,
  endRiftboundTurn,
  fromLegacyTracker,
  mtgCommanderDamage,
  mtgIsOut,
  newMtg,
  newRiftbound,
  newSwu,
  parseStoredCompanion,
  rematchRiftbound,
  scoreRiftbound,
  serializeCompanion,
  setMtgFormat,
  setRiftboundMode,
  startMtg,
  startRiftbound,
  startSwu,
  swuRemainingHp,
  toggleSwu,
  undo,
  undoable,
  updateRiftboundPlayer,
  updateSwuPlayer,
  withUndo,
  type RiftboundState,
} from "./state.ts";

const field = (name: string) => ({ id: name, name });

function riftboundDuel(): RiftboundState {
  let state = newRiftbound();
  state = updateRiftboundPlayer(state, 0, { name: "Kevin", battlefields: [field("A"), field("B"), field("C")] });
  state = updateRiftboundPlayer(state, 1, { name: "Léa", battlefields: [field("D")] });
  state = drawBattlefields(state, () => 0.5);
  return startRiftbound(state, 0);
}

describe("compagnon Riftbound", () => {
  it("tire un champ de bataille par joueur et les met en jeu", () => {
    const state = riftboundDuel();
    assert.equal(state.players[0].chosen, 1);
    assert.equal(state.players[1].chosen, 0);
    assert.deepEqual(state.control, [null, null]);
  });

  it("finit la partie au 8e point, en duel", () => {
    let state = riftboundDuel();
    for (let i = 0; i < 8; i++) state = scoreRiftbound(state, 0, 1, i % 2 ? "hold" : "conquer", 10);
    assert.equal(state.phase, "over");
    assert.equal(state.winner, 0);
    assert.equal(state.players[0].holds, 4);
    assert.equal(state.players[0].conquers, 4);
    // Plus de point après la victoire.
    assert.equal(scoreRiftbound(state, 1, 1, "hold", 11), state);
  });

  it("vise 11 points en 2 contre 2", () => {
    let state = startRiftbound(setRiftboundMode(newRiftbound(), "teams"), 0);
    for (let i = 0; i < 10; i++) state = scoreRiftbound(state, 2, 1, "other", 0);
    assert.equal(state.phase, "playing");
    state = scoreRiftbound(state, 2, 1, "other", 0);
    assert.equal(state.phase, "over");
  });

  it("ne descend pas sous zéro", () => {
    const state = riftboundDuel();
    assert.equal(scoreRiftbound(state, 0, -1, "other", 0), state);
  });

  it("fait tourner le contrôle d'un champ : joueur 1, joueur 2, libre", () => {
    let state = riftboundDuel();
    state = cycleRiftboundControl(state, 0);
    assert.equal(state.control[0], 0);
    state = cycleRiftboundControl(state, 0);
    assert.equal(state.control[0], 1);
    state = cycleRiftboundControl(state, 0);
    assert.equal(state.control[0], null);
  });

  it("avance le tour quand le premier joueur rejoue", () => {
    let state = riftboundDuel();
    state = endRiftboundTurn(state);
    assert.equal(state.active, 1);
    assert.equal(state.turn, 1);
    state = endRiftboundTurn(state);
    assert.equal(state.active, 0);
    assert.equal(state.turn, 2);
    assert.equal(state.scoreByTurn.length, 3);
  });

  it("donne la main au perdant pour la revanche", () => {
    let state = riftboundDuel();
    for (let i = 0; i < 8; i++) state = scoreRiftbound(state, 0, 1, "other", 0);
    const rematch = rematchRiftbound(state, () => 0);
    assert.equal(rematch.phase, "setup");
    assert.equal(rematch.first, 1);
    assert.equal(rematch.players[0].chosen, 0);
  });

  it("reprend l'ancien suivi", () => {
    const state = fromLegacyTracker([
      { id: "a", name: "Kevin", score: 3, energy: 0, power: 0, legend: { id: "OGN251", name: "Jinx", image: "x" } },
      { id: "b", name: "Léa", score: 1, energy: 0, power: 0, legend: null },
    ]);
    assert.ok(state);
    assert.equal(state.players[0].name, "Kevin");
    assert.equal(state.players[0].legend?.id, "OGN251");
    assert.equal(fromLegacyTracker([{ name: 1 }]), null);
  });
});

describe("compagnon Star Wars: Unlimited", () => {
  it("lit les PV de la base, 30 sans base", () => {
    let state = newSwu();
    state = updateSwuPlayer(state, 0, { base: { id: "SOR-25", name: "Tarkintown", hp: 25 } });
    state = startSwu(state, 0);
    assert.equal(swuRemainingHp(state.players[0]), 25);
    assert.equal(swuRemainingHp(state.players[1]), 30);
  });

  it("détruire une base donne la victoire à l'autre", () => {
    let state = startSwu(updateSwuPlayer(newSwu(), 0, { base: { id: "b", name: "b", hp: 25 } }), 0);
    state = damageSwuBase(state, 0, 24, 0);
    assert.equal(state.phase, "playing");
    state = damageSwuBase(state, 0, 3, 5);
    assert.equal(swuRemainingHp(state.players[0]), 0);
    assert.equal(state.phase, "over");
    assert.equal(state.winner, 1);
  });

  it("déploie le leader et annule", () => {
    const start = undoable(startSwu(newSwu(), 0));
    const deployed = withUndo(start, toggleSwu(start.present, 1, "deployed"));
    assert.equal(deployed.present.players[1].deployed, true);
    assert.equal(undo(deployed).present.players[1].deployed, false);
  });
});

describe("compagnon Magic", () => {
  it("part de 40 PV en Commander, à quatre", () => {
    const state = startMtg(newMtg("commander"), 0);
    assert.equal(state.players.length, 4);
    assert.ok(state.players.every((p) => p.life === 40));
    assert.ok(state.counters.includes("commander"));
  });

  it("les dégâts de commandant retirent aussi des PV, et 21 font perdre", () => {
    let state = startMtg(newMtg("commander"), 0);
    state = mtgCommanderDamage(state, 0, 1, 21);
    const from = state.players[1].id;
    assert.equal(state.players[0].commanderDamage[from], 21);
    assert.equal(state.players[0].life, 19);
    assert.ok(mtgIsOut(state.players[0]));
    // Un commandant ne se blesse pas lui-même.
    assert.equal(mtgCommanderDamage(state, 2, 2, 1), state);
  });

  it("change de format en gardant les joueurs", () => {
    let state = newMtg("duel");
    state = setMtgFormat(state, "brawl");
    assert.equal(state.startingLife, 25);
    assert.equal(state.players.length, 2);
    assert.equal(changeMtgLife(startMtg(state, 0), 0, -3).players[0].life, 22);
  });
});

describe("stockage du compagnon", () => {
  it("relit ce qu'il écrit, et écarte un autre jeu", () => {
    const saved = JSON.parse(serializeCompanion(undoable(newSwu())));
    assert.equal(parseStoredCompanion("swu", saved)?.present.game, "swu");
    assert.equal(parseStoredCompanion("mtg", saved), null);
    assert.equal(parseStoredCompanion("swu", { v: 0 }), null);
  });
});
