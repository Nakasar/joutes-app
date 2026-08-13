import assert from "node:assert/strict";
import crypto from "node:crypto";
import { describe, it } from "node:test";
import { APNS_JWT_PERIOD_SECONDS, apnsTokenIssuedAt, buildApnsJwt } from "./apns-jwt";

/**
 * Tests du jeton fournisseur d'APNs.
 *
 * Un seul de ces tests compte vraiment : celui qui vérifie que la signature
 * fait 64 octets. C'est la différence entre R‖S, qu'exige JOSE, et le DER
 * qu'OpenSSL produit par défaut — et Apple ne signale la seconde que par un
 * `403 InvalidProviderToken` qui envoie chercher ailleurs.
 *
 * Exécution : `npm run test`.
 */

const { privateKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function decode(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

describe("buildApnsJwt", () => {
  const params = { keyId: "ABCD123456", teamId: "XYZ9876543", privateKey, issuedAt: 1_700_000_000 };

  it("annonce ES256 et la clé qui signe", () => {
    const [header] = buildApnsJwt(params).split(".");

    assert.deepEqual(decode(header), { alg: "ES256", kid: "ABCD123456", typ: "JWT" });
  });

  it("ne porte que l'équipe et la date, sans expiration", () => {
    // Apple n'accepte pas d'`exp` : il déduit la validité de l'`iat`.
    const [, payload] = buildApnsJwt(params).split(".");

    assert.deepEqual(decode(payload), { iss: "XYZ9876543", iat: 1_700_000_000 });
  });

  it("signe en R‖S brut, pas en DER", () => {
    // Le test qui compte. Une signature ES256 en concaténation brute fait
    // exactement 64 octets ; le DER en fait 70 à 72 et varie selon la clé.
    const [header, payload, signature] = buildApnsJwt(params).split(".");
    const raw = Buffer.from(signature, "base64url");

    assert.equal(raw.length, 64, `signature de ${raw.length} octets : c'est du DER`);

    const verified = crypto.verify(
      "sha256",
      Buffer.from(`${header}.${payload}`),
      { key: privateKey, dsaEncoding: "ieee-p1363" },
      raw
    );
    assert.ok(verified);
  });
});

describe("apnsTokenIssuedAt", () => {
  it("arrondit à la demi-heure", () => {
    // Toutes les instances Vercel signent alors le même jeton pendant la même
    // demi-heure, au lieu d'en produire chacune un et de déclencher le
    // `TooManyProviderTokenUpdates` d'Apple.
    const at = apnsTokenIssuedAt(1_700_000_123_000);

    assert.equal(at % APNS_JWT_PERIOD_SECONDS, 0);
    assert.ok(at <= 1_700_000_123);
    assert.ok(at > 1_700_000_123 - APNS_JWT_PERIOD_SECONDS);
  });

  it("deux instances de la même demi-heure annoncent la même émission", () => {
    // Les octets, eux, diffèrent : ECDSA tire un aléa à chaque signature. Ce
    // qu'Apple regarde pour compter les renouvellements est l'`iat`, et c'est
    // lui qui doit être stable d'une instance à l'autre.
    const debut = 1_700_000_000_000;
    const premier = buildApnsJwt({ keyId: "K", teamId: "T", privateKey, issuedAt: apnsTokenIssuedAt(debut) });
    const second = buildApnsJwt({ keyId: "K", teamId: "T", privateKey, issuedAt: apnsTokenIssuedAt(debut + 600_000) });

    assert.equal(decode(premier.split(".")[1]).iat, decode(second.split(".")[1]).iat);
  });
});
