/**
 * Le tag d'un compte (pseudo#1234) : de quoi le fabriquer quand le compte n'en
 * a pas.
 *
 * Jusqu'au 2026-11-13, rien ne donnait de tag à un compte à sa création, ni
 * par Discord, ni par code e-mail : il n'en recevait un qu'en choisissant son
 * pseudonyme sur la page du compte, ou en s'inscrivant à un évènement (avec un
 * pseudonyme tiré au hasard). Les comptes Discord, qui arrivent déjà nommés,
 * ne passaient presque jamais par là. Le tag est désormais posé à la première
 * session (voir `ensureUserTag`, lib/db/users.ts), et
 * `npm run users:tags` rattrape les comptes existants.
 *
 * Fonctions pures : la base n'est lue qu'ailleurs.
 */

import { displayNameSchema } from "@/lib/schemas/user.schema";

export const DISPLAY_NAME_MIN = 3;
export const DISPLAY_NAME_MAX = 20;

const ADJECTIVES = ["Sombre", "Lumineux", "Rapide", "Furtif", "Puissant", "Mysterieux", "Elegant", "Feroce", "Agile", "Sage"];
const NOUNS = ["Dragon", "Phenix", "Loup", "Tigre", "Serpent", "Griffon", "Licorne", "Chimere", "Hydre", "Sphinx"];

/**
 * Ramène un nom quelconque à ce qu'un pseudonyme accepte (`displayNameSchema` :
 * lettres sans accent, chiffres, `_` et `-`, de 3 à 20 caractères), ou `null`
 * s'il n'en reste pas assez.
 *
 * Les accents tombent (« Éloïse » → « Eloise »), les espaces deviennent `_`, le
 * reste disparaît.
 */
export function sanitizeDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const cleaned = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, DISPLAY_NAME_MAX)
    .replace(/[_-]+$/, "");

  return displayNameSchema.safeParse(cleaned).success ? cleaned : null;
}

/** Un pseudonyme tiré au hasard (« SombreDragon »), valide par construction. */
export function randomDisplayName(random: () => number = Math.random): string {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  return `${adjective}${noun}`;
}

/**
 * Le pseudonyme d'un compte qui n'en a pas choisi : son nom (celui de Discord,
 * pour un compte Discord), sinon la partie locale de son adresse, sinon un nom
 * tiré au hasard.
 *
 * L'adresse de repli d'un compte Discord sans e-mail
 * (`<id>@discord.placeholder.local`) n'est pas un nom : elle est ignorée.
 */
export function deriveDisplayName(
  account: { name?: string | null; email?: string | null },
  random: () => number = Math.random
): string {
  const fromName = sanitizeDisplayName(account.name);
  if (fromName) return fromName;

  const email = account.email ?? "";
  if (!email.endsWith("@discord.placeholder.local")) {
    const fromEmail = sanitizeDisplayName(email.split("@")[0]);
    if (fromEmail) return fromEmail;
  }

  return randomDisplayName(random);
}

/** Un discriminateur à quatre chiffres, de 0000 à 9999. */
export function randomDiscriminator(random: () => number = Math.random): string {
  return Math.floor(random() * 10000)
    .toString()
    .padStart(4, "0");
}
