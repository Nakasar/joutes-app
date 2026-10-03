import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keySignature } from "./ensure";
import { INDEXES } from "./registry";

/**
 * Garde-fous du registre : un même index déclaré deux fois, ou deux champs
 * tableau dans un même index composé, ne se voient qu'au moment de poser les
 * index en production.
 *
 * Exécution : `npm run test`.
 */
describe("registre des index", () => {
  it("ne déclare pas deux fois les mêmes clés sur une collection", () => {
    const seen = new Set<string>();
    for (const { collection, keys } of INDEXES) {
      const signature = `${collection} ${keySignature(keys)}`;
      assert.ok(!seen.has(signature), `déclaré deux fois : ${signature}`);
      seen.add(signature);
    }
  });

  it("dit pour chaque index la requête qu'il sert", () => {
    for (const { collection, keys, why } of INDEXES) {
      assert.ok(why.trim().length > 0, `${collection} ${keySignature(keys)} sans justification`);
    }
  });
});
