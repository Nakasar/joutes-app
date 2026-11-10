import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Tickets d'entrée du serveur de parties (dépôt joutes-engine,
 * `joutes-session/src/ticket.rs`). Le site signe, le serveur vérifie : il n'a
 * pas besoin de connaître les comptes.
 *
 * Format : `base64url(json) + "." + base64url(hmac_sha256(secret, base64url(json)))`.
 */
export type EngineTicket = {
  game: string;
  role: "player" | "spectator" | "judge";
  seat: number | null;
  name: string;
  user: string | null;
  /** Fin de validité, en secondes depuis 1970. */
  exp: number;
};

export function signTicket(ticket: EngineTicket, secret: string): string {
  const body = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

/**
 * Vérifie l'en-tête `X-Joutes-Signature: sha256=<hex>` d'un appel du serveur de
 * parties : HMAC-SHA256 du corps brut, avec le secret partagé.
 */
export function verifyBodySignature(body: string, header: string | null, secret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const given = Buffer.from(header.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", secret).update(body).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
