import assert from "node:assert/strict";
import { test } from "node:test";

import { clientAddress, rateLimitAddress } from "./client-address.ts";

test("une adresse IPv4 reste telle quelle", () => {
  assert.equal(rateLimitAddress("203.0.113.7"), "203.0.113.7");
  assert.equal(rateLimitAddress("::ffff:203.0.113.7"), "203.0.113.7");
});

test("deux adresses IPv6 du même /64 comptent pour un seul appelant", () => {
  const first = rateLimitAddress("2001:db8:85a3:1::1");
  assert.equal(first, "2001:db8:85a3:1::/64");
  assert.equal(rateLimitAddress("2001:0db8:85a3:0001:aaaa:bbbb:cccc:dddd"), first);
  assert.equal(rateLimitAddress("[2001:DB8:85A3:1:ffff::2]"), first);
  assert.notEqual(rateLimitAddress("2001:db8:85a3:2::1"), first);
});

test("la forme compressée se développe avant de couper", () => {
  assert.equal(rateLimitAddress("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(rateLimitAddress("::1"), "0:0:0:0::/64");
});

test("l'adresse vient du premier maillon de x-forwarded-for", () => {
  const headers = new Headers({ "x-forwarded-for": "2001:db8:85a3:1::9, 10.0.0.1" });
  assert.equal(clientAddress(headers), "2001:db8:85a3:1::/64");
  assert.equal(clientAddress(new Headers()), "unknown");
});
