import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_LOGIN_CODE_ALPHABET,
  APP_LOGIN_CODE_LENGTH,
  formatAppLoginCode,
  generateAppLoginCode,
  normalizeAppLoginCode,
} from "./app-login-code.ts";

test("le code a huit caractères de l'alphabet, sans caractères ambigus", () => {
  for (let i = 0; i < 200; i += 1) {
    const code = generateAppLoginCode();
    assert.equal(code.length, APP_LOGIN_CODE_LENGTH);
    for (const char of code) assert.ok(APP_LOGIN_CODE_ALPHABET.includes(char));
  }
  for (const ambiguous of ["0", "O", "1", "I", "L"]) {
    assert.ok(!APP_LOGIN_CODE_ALPHABET.includes(ambiguous));
  }
});

test("le code affiché se relit comme le code généré", () => {
  const code = generateAppLoginCode();
  assert.equal(normalizeAppLoginCode(formatAppLoginCode(code)), code);
  assert.equal(normalizeAppLoginCode(" abcd-efgh "), "ABCDEFGH");
});
