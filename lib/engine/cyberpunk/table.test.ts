import assert from "node:assert/strict";
import { test } from "node:test";

import {
  choiceCodes,
  clickableKeys,
  gigKey,
  groupChoices,
  isDirect,
  objKey,
  subjectOf,
  targetOf,
  tellEvents,
  viewCodes,
  zoneKey,
} from "./table.ts";
import type { CpPlayer, CpPrompt, CpView } from "./types.ts";

const player = (seat: number, hand: CpPlayer["hand"]): CpPlayer => ({
  seat,
  name: `J${seat}`,
  street_cred: 4,
  gigs: 1,
  legends: [
    { id: 10 + seat, face_up: true, spent: false, code: "WNC-005a", name: "V, Streetkid", peeked: false, gears: [] },
    { id: 20 + seat, face_up: false, spent: false, code: null, name: null, peeked: false, gears: [] },
  ],
  legend_list: null,
  hand_count: hand?.length ?? 3,
  hand,
  deck_count: 30,
  trash: [{ id: 40 + seat, code: "WNC-028", name: "Appetite for Destruction" }],
  removed: [],
  eddies: 2,
  eddies_ready: 1,
  sold: false,
  called: false,
});

const view: CpView = {
  viewer: { Seat: 0 },
  turn: 3,
  phase: "main",
  active: 0,
  first: 0,
  overtime: false,
  players: [player(0, [{ id: 50, code: "WNC-025", name: "Mantis Blades", cost: 2 }]), player(1, null)],
  field: [
    { id: 60, code: "WNC-021", name: "Valentino Guerrera", owner: 0, controller: 0, spent: false, power: 4, lag: false, solo: false, keywords: [], gears: [{ id: 61, code: "WNC-025", name: "Mantis Blades" }] },
    { id: 70, code: "WNC-006", name: "6th Street Recruits", owner: 1, controller: 1, spent: true, power: 6, lag: false, solo: false, keywords: ["blocker"], gears: [] },
  ],
  gigs: [
    { id: 0, die: "d4", owner: 0, controller: 0, value: 3, in_fixer: false },
    { id: 7, die: "d6", owner: 1, controller: 1, value: 5, in_fixer: false },
  ],
  attack: null,
  to_act: 0,
  result: null,
};

test("chaque choix revient à la carte ou au dé qu'on clique", () => {
  assert.equal(subjectOf({ type: "sell", card: 50 }), "o50");
  assert.equal(subjectOf({ type: "call", legend: 20 }), "o20");
  assert.equal(subjectOf({ type: "roll", gig: 3 }), "g3");
  assert.equal(subjectOf({ type: "pass" }), null);
  // Une attaque des Gigs vise la zone de Gigs adverse.
  assert.equal(targetOf({ type: "attack", attacker: 60 }, 1), zoneKey(1));
  assert.equal(targetOf({ type: "attack", attacker: 60, target: 70 }, 1), "o70");
  assert.equal(targetOf({ type: "play", card: 50, on: 60 }, 1), "o60");
  assert.equal(targetOf({ type: "play", card: 50 }, 1), null);
});

test("les choix se rangent par carte, le reste en boutons", () => {
  const prompt: CpPrompt = {
    kind: "main",
    text: "À vous de jouer.",
    choices: [
      { action: { type: "sell", card: 50 }, label: "Vendre Mantis Blades" },
      { action: { type: "play", card: 50, on: 60 }, label: "Jouer Mantis Blades" },
      { action: { type: "attack", attacker: 60 }, label: "Attaquer les Gigs" },
      { action: { type: "attack", attacker: 60, target: 70 }, label: "Attaquer 6th Street Recruits" },
      { action: { type: "call", legend: 20 }, label: "Appeler la Légende face cachée n° 2" },
      { action: { type: "pick", obj: 99 }, label: "Une carte du deck", card: "WNC-010" },
      { action: { type: "pass" }, label: "Passer" },
    ],
  };
  const keys = clickableKeys(view, 0);
  assert.ok(keys.has(objKey(50)) && keys.has(gigKey(7)) && keys.has(zoneKey(1)) && keys.has(objKey(61)));
  // La main adverse n'est pas sur la table.
  assert.equal([...keys].filter((key) => key.startsWith("o")).length, 8);
  const { bySubject, loose } = groupChoices(prompt, keys);
  assert.equal(bySubject.get(objKey(50))?.length, 2);
  assert.equal(bySubject.get(objKey(60))?.length, 2);
  assert.equal(bySubject.get(objKey(20))?.length, 1);
  assert.deepEqual(
    loose.map((choice) => choice.label),
    ["Une carte du deck", "Passer"],
  );
  assert.equal(isDirect([{ action: { type: "pick_gig", gig: 7 }, label: "" }]), true);
  assert.equal(isDirect(bySubject.get(objKey(20)) ?? []), false);
});

test("le récit nomme les cartes des évènements, pas les sièges ni les Gigs", () => {
  const known = viewCodes(view);
  assert.equal(known.get(61), "WNC-025");
  assert.equal(known.get(20), undefined);
  const told = tellEvents(
    [
      { event: { type: "attacked", attacker: 60, def: 21, target: 70 }, text: "Valentino Guerrera attaque.", rule: "9.1" },
      { event: { type: "stole", actor: 60, gig: 0, from: 1, to: 0, value: 3 }, text: "Vol.", rule: null },
      { event: { type: "spent", obj: 20 }, text: null, rule: null },
    ],
    5,
    known,
    new Map([[21, "WNC-021"]]),
  );
  assert.deepEqual(
    told.map((entry) => [entry.key, entry.codes]),
    [
      [5, ["WNC-021", "WNC-006"]],
      [6, ["WNC-021"]],
    ],
  );
  assert.deepEqual(choiceCodes({ action: { type: "play", card: 50, on: 60 }, label: "" }, known), ["WNC-025", "WNC-021"]);
});
