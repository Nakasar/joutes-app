import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ENGINE_VERSION } from "./version.ts";

test("ENGINE_VERSION suit le fichier VERSION du moteur copié", () => {
  const file = readFileSync(new URL("./pkg/VERSION", import.meta.url), "utf8");
  assert.equal(file.split(" ")[0].trim(), ENGINE_VERSION);
});
