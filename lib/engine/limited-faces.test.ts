import assert from "node:assert/strict";
import { test } from "node:test";

import { faceCurve, groupCounts, sortPack, type CardFace, type Faces } from "./limited-faces.ts";

const face = (cost: number | null, groups: string[], rarity: number, main = true): CardFace => ({
  name: "",
  landscape: false,
  cost,
  groups,
  kind: "",
  line: "",
  rarity,
  ring: null,
  main,
});

const known: Record<string, CardFace> = {
  A: face(1, ["fury"], 0),
  B: face(4, ["mind"], 2),
  C: face(3, ["calm", "mind"], 2),
  D: face(1, ["body"], 0),
  L: face(null, ["fury"], 1, false),
};

const faces: Faces = {
  get: (code) => known[code],
  name: (code) => code,
  groups: ["fury", "calm", "mind", "body"].map((key) => ({ key, label: key, color: "#000" })),
  groupWord: "Domaine",
};

test("le tri d'un paquet garde l'ordre du moteur à égalité", () => {
  const pack = [{ code: "A" }, { code: "B" }, { code: "C" }, { code: "D" }];
  const codes = (sorted: { code: string }[]) => sorted.map((card) => card.code);
  assert.deepEqual(codes(sortPack(pack, faces, "rarity")), ["B", "C", "A", "D"]);
  assert.deepEqual(codes(sortPack(pack, faces, "cost")), ["A", "D", "C", "B"]);
  assert.deepEqual(codes(sortPack(pack, faces, "group")), ["A", "C", "B", "D"]);
  assert.equal(pack[0].code, "A");
});

test("les comptes par groupe et la courbe ignorent ce qui n'est pas du deck principal", () => {
  assert.deepEqual(groupCounts(["A", "C", "C", "Z"], faces), { fury: 1, calm: 2, mind: 2 });
  assert.deepEqual(faceCurve(["A", "D", "C", "B", "L"], faces), [0, 2, 0, 1, 1, 0, 0, 0]);
});
