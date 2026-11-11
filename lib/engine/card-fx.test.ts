import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fxFor, matterOf, windowEnd, windowOf, type FxDefs } from "./card-fx.ts";
import type { EngineTold } from "./types.ts";

const told = (event: EngineTold["event"], text = "…"): EngineTold => ({ event, text, rule: null });

describe("matterOf", () => {
  const spell = (name: string) => ({ name, kind: "spell", tags: [] });
  it("lit le nom d'un sort", () => {
    assert.equal(matterOf(spell("Falling Star")), "astral");
    assert.equal(matterOf(spell("Bellows Breath")), "feu");
    assert.equal(matterOf(spell("Sudden Storm")), "eclair");
    assert.equal(matterOf(spell("Hextech Ray")), "arcane");
    assert.equal(matterOf(spell("Rocket Barrage")), "explosif");
    assert.equal(matterOf(spell("Noxian Guillotine")), "acier");
    assert.equal(matterOf(spell("Singularity")), "neant");
  });
  it("le feu passe avant l'éclair (Firestorm)", () => {
    assert.equal(matterOf(spell("Firestorm")), "feu");
  });
  it("garde les choix faits à la main", () => {
    assert.equal(matterOf(spell("Decisive Strike")), "domaine");
    assert.equal(matterOf(spell("Wind Wall")), "vent");
  });
  it("prend la matière du champion, par son nom ou ses tags", () => {
    assert.equal(matterOf({ name: "Annie, Fiery", kind: "unit", tags: ["Annie", "Noxus"] }), "feu");
    assert.equal(matterOf({ name: "Loose Cannon", kind: "legend", tags: ["Jinx"] }), "explosif");
    assert.equal(matterOf({ name: "Stacked Deck", kind: "spell", tags: ["Twisted Fate"] }), "arcane");
  });
  it("retombe sur la faction, puis sur le domaine", () => {
    assert.equal(matterOf({ name: "Mistwraith", kind: "unit", tags: ["Shadow Isles"] }), "ombre");
    assert.equal(matterOf({ name: "Ancient Warmonger", kind: "unit", tags: ["Ionia"] }), "domaine");
    assert.equal(matterOf({ name: "Fury Rune", kind: "rune", tags: [] }), "domaine");
  });
});

// Falling Star (déf. 29) : 3 à Darius (obj 12), 3 à Sprite (obj 13), qui meurt.
const defs: FxDefs = (def) =>
  def === 29 ? { matter: "astral", color: "#ef4444", spell: true } : def === 50 ? { matter: "ombre", color: "#a855f7", spell: false } : null;
const fallingStar = [
  told({ type: "paid", seat: 0, energy: 2, power: 2, exhausted: [], recycled: [] }),
  told({ type: "played", seat: 0, obj: 90, def: 29, to: null, from_hidden: false }),
  told({ type: "targeted", item: 1, objs: [12, 13] }),
  told({ type: "priority_passed", seat: 1 }),
  told({ type: "resolved", item: 1, def: 29 }),
  told({ type: "damaged", unit: 12, amount: 3 }),
  told({ type: "damaged", unit: 13, amount: 3 }),
  told({ type: "died", unit: 13, def: 7, owner: 1 }),
  told({ type: "drew", seat: 0, count: 1, cards: [] }),
  told({ type: "turn_ended", seat: 0 }),
  told({ type: "turn_started", seat: 1, turn: 6 }),
  told({ type: "drew", seat: 0, count: 1, cards: [] }),
];

describe("fxFor", () => {
  it("borne la résolution d'une carte", () => {
    assert.equal(windowOf(fallingStar, 6), 4);
    assert.equal(windowEnd(fallingStar, 4), 9);
    assert.equal(windowOf(fallingStar, 11), null);
  });

  it("montre la carte et toutes ses frappes quand elle se résout", () => {
    assert.deepEqual(fxFor(fallingStar, 4, defs, 0), [
      { kind: "cast", def: 29, seat: 0, source: null, style: { matter: "astral", color: "#ef4444" }, spell: true },
      {
        kind: "strike",
        style: { matter: "astral", color: "#ef4444" },
        targets: [
          { obj: 12, amount: 3 },
          { obj: 13, amount: 3 },
        ],
        fromCast: true,
      },
    ]);
  });

  it("ne redessine pas les dégâts déjà frappés, teinte la mort et la pioche de la carte", () => {
    assert.deepEqual(fxFor(fallingStar, 5, defs, 0), []);
    assert.deepEqual(fxFor(fallingStar, 7, defs, 0), [{ kind: "die", obj: 13, style: { matter: "astral", color: "#ef4444" } }]);
    assert.equal(fxFor(fallingStar, 8, defs, 0)[0].kind, "draw");
    assert.deepEqual(fxFor(fallingStar, 8, defs, 1), [], "la pioche d'un autre ne se dessine pas");
    assert.deepEqual(fxFor(fallingStar, 11, defs, 0), [], "la pioche du tour non plus");
  });

  it("dessine les dégâts de combat en une fois", () => {
    const combat = [
      told({ type: "combat_started", bf: 1, attacker: 0, defender: 1 }),
      told({ type: "damaged", unit: 12, amount: 4 }),
      told({ type: "damaged", unit: 20, amount: 5 }),
      told({ type: "combat_damage", bf: 1, assigned: [[12, 4], [20, 5]] }),
      told({ type: "died", unit: 20, def: 7, owner: 0 }),
    ];
    assert.deepEqual(fxFor(combat, 1, defs, 0), [
      {
        kind: "clash",
        bf: 1,
        targets: [
          { obj: 12, amount: 4 },
          { obj: 20, amount: 5 },
        ],
      },
    ]);
    assert.deepEqual(fxFor(combat, 2, defs, 0), []);
    assert.deepEqual(fxFor(combat, 4, defs, 0), [{ kind: "die", obj: 20, style: null }]);
  });

  it("part de l'unité dont la capacité se résout", () => {
    const ability = [
      told({ type: "triggered", seat: 1, source: 33, def: 50, ability: 0 }),
      told({ type: "resolved", item: 4, def: 50 }),
      told({ type: "might_changed", unit: 12, delta: -2 }),
    ];
    const [cast] = fxFor(ability, 1, defs, 0);
    assert.deepEqual(cast, { kind: "cast", def: 50, seat: 1, source: 33, style: { matter: "ombre", color: "#a855f7" }, spell: false });
    assert.deepEqual(fxFor(ability, 2, defs, 0), [{ kind: "might", obj: 12, delta: -2, style: { matter: "ombre", color: "#a855f7" } }]);
  });

  it("ignore un déplacement ordinaire et une carte inconnue", () => {
    const moves = [told({ type: "moved", seat: 0, units: [12], to: { Bf: 0 } }), told({ type: "resolved", item: 1, def: 999 })];
    assert.deepEqual(fxFor(moves, 0, defs, 0), []);
    assert.deepEqual(fxFor(moves, 1, defs, 0), []);
  });
});
