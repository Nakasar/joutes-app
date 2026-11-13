import assert from "node:assert/strict";
import { test } from "node:test";

import {
  choiceCodes,
  clickableIds,
  groupChoices,
  isDirect,
  subjectOf,
  targetOf,
  tellEvents,
  viewCodes,
} from "./table.ts";
import type { SwuPrompt, SwuView } from "./types.ts";

const unit = (id: number, code: string, controller: number) => ({
  id,
  code,
  name: code,
  owner: controller,
  controller,
  arena: "ground" as const,
  leader: false,
  token: false,
  exhausted: false,
  damage: 0,
  power: 1,
  hp: 1,
  keywords: [],
  upgrades: [{ id: id + 100, code: "SOR-T02", name: "Shield", controller }],
  captives: [],
});

const player = (seat: number, hand: { id: number; code: string; name: string }[] | null) => ({
  seat,
  name: `J${seat}`,
  base: { id: seat, code: "SOR-024", name: "Base", damage: 0, hp: 30, epic_used: false },
  leader: { id: 10 + seat, code: "SOR-005", name: "Leader", deployed: false, exhausted: false, epic_used: false },
  hand_count: hand?.length ?? 3,
  hand,
  deck_count: 30,
  discard: [{ id: 70 + seat, code: "SOR-200", name: "Jetée" }],
  resources: 2,
  resources_ready: 2,
  resource_cards: null,
  force: false,
  credits: 0,
});

const view: SwuView = {
  viewer: { Seat: 0 },
  round: 1,
  phase: "action",
  initiative: 0,
  initiative_taken: false,
  active: 0,
  players: [player(0, [{ id: 40, code: "SOR-053", name: "Sabre" }]), player(1, null)],
  ground: [unit(20, "SOR-049", 0), unit(21, "SOR-128", 1)],
  space: [],
  attack: null,
  to_act: 0,
  result: null,
};

test("chaque action a sa carte et, s'il y en a une, sa cible", () => {
  assert.equal(subjectOf({ type: "play", card: 40, on: 20 }), 40);
  assert.equal(targetOf({ type: "play", card: 40, on: 20 }), 20);
  assert.equal(targetOf({ type: "play", card: 40 }), null);
  assert.equal(subjectOf({ type: "attack", attacker: 20, target: 1 }), 20);
  assert.equal(targetOf({ type: "attack", attacker: 20, target: 1 }), 1);
  assert.equal(subjectOf({ type: "pass" }), null);
});

test("les choix se rangent sur les cartes de la table, le reste dans la barre", () => {
  const prompt: SwuPrompt = {
    kind: "turn",
    text: "À vous de jouer.",
    choices: [
      { action: { type: "play", card: 40, on: 20 }, label: "Jouer Sabre sur Obi-Wan", card: "SOR-053" },
      { action: { type: "attack", attacker: 20, target: 21 }, label: "Attaquer" },
      { action: { type: "attack", attacker: 20, target: 1 }, label: "Attaquer la base" },
      { action: { type: "play", card: 70, on: undefined }, label: "Jouer depuis la défausse", card: "SOR-200" },
      { action: { type: "pass" }, label: "Passer" },
    ],
  };
  const ids = clickableIds(view, 0);
  assert.ok(ids.has(40) && ids.has(20) && ids.has(120) && ids.has(1) && ids.has(11));
  assert.ok(!ids.has(70), "la défausse n'est pas dessinée sur la table");
  const { bySubject, loose } = groupChoices(prompt, ids);
  assert.equal(bySubject.get(40)?.length, 1);
  assert.equal(bySubject.get(20)?.length, 2);
  assert.deepEqual(
    loose.map((choice) => choice.action.type),
    ["play", "pass"],
  );
  assert.equal(isDirect(bySubject.get(40) ?? []), false);
  assert.equal(isDirect([{ action: { type: "pick", obj: 21 }, label: "x" }]), true);
});

test("la main de l'adversaire ne se clique pas, et chaque objet visible a son code", () => {
  const other = clickableIds(view, 1);
  assert.ok(!other.has(40));
  const codes = viewCodes(view);
  assert.equal(codes.get(20), "SOR-049");
  assert.equal(codes.get(120), "SOR-T02");
  assert.equal(codes.get(70), "SOR-200");
  assert.deepEqual(
    choiceCodes({ action: { type: "attack", attacker: 20, target: 21 }, label: "Attaquer" }, codes),
    ["SOR-049", "SOR-128"],
  );
});

test("le récit garde les évènements racontés, avec leur numéro et les cartes qu'ils nomment", () => {
  const known = new Map([[20, "SOR-049"]]);
  const byDef = new Map([[7, "SOR-128"]]);
  const told = tellEvents(
    [
      { event: { type: "drew", seat: 0 }, text: "" },
      { event: { type: "played", card: 20, seat: 1 }, text: "Bob joue Obi-Wan Kenobi." },
      { event: { type: "created", def: 7, obj: 99 }, text: "Un jeton arrive.", rule: "8.1" },
    ],
    12,
    known,
    byDef,
  );
  assert.deepEqual(
    told.map((entry) => [entry.key, entry.codes]),
    [
      [13, ["SOR-049"]],
      [14, ["SOR-128"]],
    ],
  );
});
