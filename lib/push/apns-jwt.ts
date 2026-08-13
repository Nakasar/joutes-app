import crypto from "node:crypto";

/**
 * Le jeton fournisseur d'APNs.
 *
 * Apple n'authentifie pas par certificat mais par un JWT court, signé en ES256
 * avec la clé `.p8` du compte développeur. Deux pièges y attendent, et tous
 * deux se manifestent par une erreur qui ne dit pas sa cause.
 *
 * **La forme de la signature.** ECDSA se sérialise de deux façons : en DER,
 * qu'OpenSSL produit par défaut, et en concaténation brute R‖S de 64 octets,
 * que JOSE exige. Node ne fait la seconde que si on la demande
 * (`dsaEncoding: "ieee-p1363"`). Sans ce réglage, APNs répond
 * `403 InvalidProviderToken` — un message qui envoie chercher du côté de la
 * clé, du Key ID ou du Team ID, jamais du côté de l'encodage.
 *
 * **La cadence.** Un jeton vaut une heure, et Apple répond
 * `429 TooManyProviderTokenUpdates` à qui en régénère plus d'un par tranche de
 * vingt minutes. Sur Vercel, chaque instance a sa propre mémoire : dix
 * instances qui signent chacune la leur suffisent à déclencher le refus. D'où
 * `iat` arrondi à la demi-heure : toutes annoncent alors la même émission, et
 * Apple n'y voit qu'un seul renouvellement. Les octets, eux, diffèrent d'une
 * signature à l'autre — ECDSA tire un aléa —, mais c'est l'`iat` qu'Apple
 * compte.
 *
 * Module pur : il ne fait que signer. Le cache et le réseau vivent dans
 * `lib/push/apns.ts`.
 */

/** Un jeton APNs vaut une heure ; on le renouvelle à la demi-heure. */
export const APNS_JWT_PERIOD_SECONDS = 30 * 60;

function base64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Arrondit à la période inférieure, pour que toutes les instances signent le
 * même jeton pendant la même demi-heure.
 */
export function apnsTokenIssuedAt(now: number = Date.now()): number {
  const seconds = Math.floor(now / 1000);
  return seconds - (seconds % APNS_JWT_PERIOD_SECONDS);
}

export function buildApnsJwt(params: {
  keyId: string;
  teamId: string;
  privateKey: string;
  issuedAt?: number;
}): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: params.keyId, typ: "JWT" }));
  // Pas d'`exp` : Apple n'en veut pas, il déduit la validité de l'`iat`.
  const payload = base64url(
    JSON.stringify({ iss: params.teamId, iat: params.issuedAt ?? apnsTokenIssuedAt() })
  );

  const signature = crypto.sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: params.privateKey,
    dsaEncoding: "ieee-p1363",
  });

  return `${header}.${payload}.${base64url(signature)}`;
}
