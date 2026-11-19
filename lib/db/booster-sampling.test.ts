import assert from "node:assert/strict";
import { test } from "node:test";

import { boosterTypeCountsPipeline, sampleBoostersPipeline, SAMPLED_CARD_PROJECTION } from "./booster-sampling.ts";

test("le $project des cartes d'un booster tiré n'exclut que _id", () => {
  // Mongo refuse un $project qui mélange exclusions et inclusions : seule _id
  // peut accompagner des inclusions, sinon toute l'agrégation échoue.
  for (const [field, value] of Object.entries(SAMPLED_CARD_PROJECTION)) {
    if (field === "_id") assert.equal(value, 0);
    else assert.equal(value, 1, `${field} doit être une inclusion`);
  }
  assert.deepEqual(Object.keys(SAMPLED_CARD_PROJECTION).sort(), ["_id", "cardId", "collectorNumber", "foil", "setCode"]);
});

test("le pipeline d'échantillonnage enchaîne match, sample puis lookup des cartes", () => {
  const pipeline = sampleBoostersPipeline({ userId: "u" }, 6);
  assert.deepEqual(
    pipeline.map((stage) => Object.keys(stage)[0]),
    ["$match", "$sample", "$lookup"],
  );
  assert.deepEqual(pipeline[0], { $match: { userId: "u" } });
  assert.deepEqual(pipeline[1], { $sample: { size: 6 } });
  const lookup = pipeline[2].$lookup as { from: string; pipeline: Record<string, unknown>[] };
  assert.equal(lookup.from, "booster-cards");
  assert.deepEqual(lookup.pipeline, [{ $project: SAMPLED_CARD_PROJECTION }]);
});

test("le pipeline des types groupe par type et extension, sans $sort ni $skip", () => {
  const pipeline = boosterTypeCountsPipeline({ gameId: "g" });
  assert.deepEqual(pipeline, [
    { $match: { gameId: "g" } },
    { $group: { _id: { type: "$type", set: "$setCode" }, count: { $sum: 1 } } },
  ]);
});
