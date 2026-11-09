import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isCredentialedOrigin, isOwnHost } from "./own-origins.ts";

const PROD = { NODE_ENV: "production" };

describe("isOwnHost", () => {
  it("reconnaît les hôtes de production", () => {
    assert.equal(isOwnHost("joutes.app", PROD), true);
    assert.equal(isOwnHost("www.joutes.app", PROD), true);
    assert.equal(isOwnHost("API.joutes.app", PROD), true);
  });

  it("refuse un hôte étranger, même s'il ressemble au nôtre", () => {
    assert.equal(isOwnHost("joutes.app.evil.example", PROD), false);
    assert.equal(isOwnHost("evil-joutes.app", PROD), false);
    assert.equal(isOwnHost("169.254.169.254", PROD), false);
    assert.equal(isOwnHost("localhost:3000", PROD), false);
    assert.equal(isOwnHost(null, PROD), false);
    assert.equal(isOwnHost("", PROD), false);
  });

  it("reconnaît les hôtes configurés pour le déploiement", () => {
    const env = { ...PROD, NEXT_PUBLIC_BASE_URL: "https://staging.example.org", VERCEL_URL: "joutes-abc.vercel.app" };
    assert.equal(isOwnHost("staging.example.org", env), true);
    assert.equal(isOwnHost("joutes-abc.vercel.app", env), true);
  });

  it("n'accepte *.vercel.app que sur Vercel", () => {
    assert.equal(isOwnHost("joutes-git-x.vercel.app", { ...PROD, VERCEL: "1" }), true);
    assert.equal(isOwnHost("joutes-git-x.vercel.app", PROD), false);
  });

  it("accepte la machine locale hors production seulement", () => {
    assert.equal(isOwnHost("localhost:3000", { NODE_ENV: "development" }), true);
    assert.equal(isOwnHost("127.0.0.1:4000", { NODE_ENV: "test" }), true);
  });
});

describe("isCredentialedOrigin", () => {
  it("accepte nos pages et l'application mobile", () => {
    assert.equal(isCredentialedOrigin("https://www.joutes.app", PROD), true);
    assert.equal(isCredentialedOrigin("tauri://localhost", PROD), true);
    assert.equal(isCredentialedOrigin("http://tauri.localhost", PROD), true);
  });

  it("refuse les autres origines", () => {
    assert.equal(isCredentialedOrigin("https://evil.example", PROD), false);
    assert.equal(isCredentialedOrigin("http://www.joutes.app", PROD), false);
    assert.equal(isCredentialedOrigin("null", PROD), false);
    assert.equal(isCredentialedOrigin(null, PROD), false);
  });

  it("accepte la machine locale en développement", () => {
    assert.equal(isCredentialedOrigin("http://localhost:3000", { NODE_ENV: "development" }), true);
    assert.equal(isCredentialedOrigin("http://localhost:3000", PROD), false);
  });
});
