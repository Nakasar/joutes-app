import crypto from "node:crypto";

/**
 * L'assertion qu'on échange contre un jeton d'accès Google.
 *
 * FCM en version 1 n'accepte plus la clé de serveur d'autrefois : il faut un
 * jeton OAuth2, obtenu en présentant un JWT signé avec la clé privée du compte
 * de service. C'est ce JWT que ce module fabrique.
 *
 * Rien du piège d'APNs ici : Google veut du RS256, dont la signature n'a qu'une
 * forme. Mais l'`aud` doit être l'adresse du service de jetons, pas celle de
 * FCM — s'y tromper donne un `invalid_grant` laconique.
 *
 * Module pur : l'échange contre le jeton d'accès vit dans `lib/push/fcm.ts`.
 */

export const GCP_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** Google plafonne la durée de vie d'une assertion à une heure. */
export const GCP_ASSERTION_LIFETIME_SECONDS = 3600;

function base64url(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function buildGcpAssertion(params: {
  clientEmail: string;
  privateKey: string;
  issuedAt?: number;
}): string {
  const issuedAt = params.issuedAt ?? Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      iss: params.clientEmail,
      scope: FCM_SCOPE,
      // L'adresse du service de jetons, pas celle de FCM.
      aud: GCP_TOKEN_ENDPOINT,
      iat: issuedAt,
      exp: issuedAt + GCP_ASSERTION_LIFETIME_SECONDS,
    })
  );

  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), params.privateKey);

  return `${header}.${payload}.${base64url(signature)}`;
}
