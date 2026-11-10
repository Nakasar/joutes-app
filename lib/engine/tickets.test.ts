import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { signTicket, verifyBodySignature } from "./tickets.ts";

test("signTicket écrit le format attendu par le serveur de parties", () => {
  const token = signTicket(
    { game: "abc", role: "player", seat: 1, name: "Kevin", user: "u1", exp: 2000000000 },
    "secret",
  );
  const [body, signature] = token.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(body, "base64url").toString()), {
    game: "abc",
    role: "player",
    seat: 1,
    name: "Kevin",
    user: "u1",
    exp: 2000000000,
  });
  assert.equal(signature, createHmac("sha256", "secret").update(body).digest("base64url"));
  assert.doesNotMatch(token, /[+/=]/);
});

test("verifyBodySignature n'accepte que la signature du secret partagé", () => {
  const body = JSON.stringify({ game: "abc", result: { winners: [0], reason: "points" } });
  const good = `sha256=${createHmac("sha256", "secret").update(body).digest("hex")}`;

  assert.equal(verifyBodySignature(body, good, "secret"), true);
  assert.equal(verifyBodySignature(body, good, "autre"), false);
  assert.equal(verifyBodySignature(`${body} `, good, "secret"), false);
  assert.equal(verifyBodySignature(body, null, "secret"), false);
  assert.equal(verifyBodySignature(body, "sha256=zz", "secret"), false);
});
