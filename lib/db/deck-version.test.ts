import test from "node:test";
import assert from "node:assert/strict";
import { deckVersionWrite } from "@/lib/db/deck-version";

/**
 * Les deux cas limites de la concurrence optimiste des decks tiennent à un seul
 * fait : un deck écrit avant l'introduction de `version` n'a pas le champ, et
 * `toDeck` le rend comme valant 1. La garde et le bump doivent tous deux le
 * savoir.
 */

test("sans version attendue, l'écriture n'est pas gardée", () => {
  // Les clients pas encore repris gardent le « dernier gagne ».
  const write = deckVersionWrite(4, undefined);

  assert.deepEqual(write.guard, {});
  assert.equal(write.inc, 1);
});

test("avec une version attendue, elle entre dans le filtre", () => {
  const write = deckVersionWrite(4, 4);

  assert.deepEqual(write.guard, { version: 4 });
  assert.equal(write.inc, 1);
});

test("la première version accepte aussi un champ absent", () => {
  // Sinon aucun deck d'avant l'introduction du champ ne serait modifiable :
  // son lecteur annonce 1, le document n'a rien.
  const write = deckVersionWrite(undefined, 1);

  assert.deepEqual(write.guard, {
    $or: [{ version: 1 }, { version: { $exists: false } }],
  });
});

test("un champ absent est posé à 2, jamais incrémenté", () => {
  // `$inc` sur un champ absent le pose à 1, pas à 2. Le deck resterait donc à 1
  // après son premier enregistrement, et une seconde écriture tenant « 1 »
  // passerait la garde — l'écrasement silencieux que tout ceci évite.
  const write = deckVersionWrite(undefined, 1);

  assert.equal(write.set, 2);
  assert.equal(write.inc, undefined);
});

test("un champ présent est incrémenté, jamais posé", () => {
  // `$set` et `$inc` sur le même champ font une écriture invalide.
  const write = deckVersionWrite(7, 7);

  assert.equal(write.inc, 1);
  assert.equal(write.set, undefined);
});

test("une version illisible en base est traitée comme absente", () => {
  // Un document abîmé ne doit pas produire un `$inc` sur une chaîne — ni sur un
  // `NaN`, que `typeof` annonce pourtant comme un nombre et qu'aucune garde ne
  // retrouverait ensuite, `NaN` n'égalant pas même lui-même.
  const cases: [string, unknown][] = [
    ["null", null],
    ["une chaîne", "3"],
    ["un objet", {}],
    ["NaN", Number.NaN],
    ["l'infini", Number.POSITIVE_INFINITY],
    ["un rang décimal", 1.5],
  ];

  for (const [label, stored] of cases) {
    const write = deckVersionWrite(stored, 1);
    assert.equal(write.set, 2, `${label} devrait être posé`);
    assert.equal(write.inc, undefined, `${label} ne devrait pas être incrémenté`);
  }
});

test("après le premier enregistrement d'un deck ancien, la garde mord", () => {
  // Le scénario complet, en deux temps : deux clients lisent 1 sur un deck sans
  // champ. Le premier écrit et pose 2 ; le second tient toujours 1.
  const first = deckVersionWrite(undefined, 1);
  assert.equal(first.set, 2);

  // Le document porte maintenant 2. Ni `{version: 1}` ni `{$exists: false}` ne
  // le décrivent : le filtre du second ne trouve rien, et c'est un conflit.
  const second = deckVersionWrite(2, 1);
  assert.deepEqual(second.guard, {
    $or: [{ version: 1 }, { version: { $exists: false } }],
  });
  const stored = 2;
  const matches =
    stored === 1 || stored === undefined;
  assert.equal(matches, false, "la garde du second ne doit pas correspondre");
});
