import assert from "node:assert/strict";
import { test } from "node:test";

import { PLATFORM_INDEXES } from "@/lib/db/indexes/platform";

/**
 * `lib/net/rate-limit.ts` charge la base (`server-only`) : ce test tient ce qui
 * ne peut pas dériver sans qu'on le voie, l'index qui efface les compteurs.
 */
test("les compteurs de limite de débit ont leur index d'expiration", () => {
  const ttl = PLATFORM_INDEXES.find((index) => index.collection === "rateLimits");
  assert.deepEqual(ttl?.keys, { expiresAt: 1 });
  assert.equal(ttl?.options?.expireAfterSeconds, 0);
});
