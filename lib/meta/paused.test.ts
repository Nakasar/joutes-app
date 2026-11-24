import assert from "node:assert/strict";
import { test } from "node:test";

import { META_PAUSED_BODY, META_PAUSED_MESSAGE, metaPausedPage } from "./paused.ts";

test("la page d'attente de la méta dit « Bientôt de retour... » et n'est pas indexée", () => {
  const page = metaPausedPage();
  assert.ok(page.includes(`<h1>${META_PAUSED_MESSAGE}</h1>`));
  assert.ok(page.includes('<meta name="robots" content="noindex">'));
  assert.equal(META_PAUSED_MESSAGE, "Bientôt de retour...");
});

test("les routes REST de la méta coupée répondent le code PAUSED", () => {
  assert.deepEqual(META_PAUSED_BODY, { error: "Bientôt de retour...", code: "PAUSED" });
});
