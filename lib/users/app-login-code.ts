import { randomInt } from "node:crypto";

/**
 * Le code de connexion de l'app mobile : huit caractères pris dans un alphabet
 * sans lettres ni chiffres qui se confondent (pas de 0/O, 1/I/L), assez court
 * pour se recopier à la main, assez long pour ne pas se deviner dans sa durée
 * de vie (32^8 ≈ 10^12 possibilités, dix essais par minute).
 *
 * Il s'affiche en deux groupes (« ABCD-EFGH ») ; l'app retire le tiret et les
 * espaces, et met en majuscules, avant de l'envoyer.
 */

export const APP_LOGIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const APP_LOGIN_CODE_LENGTH = 8;
export const APP_LOGIN_CODE_TTL_MINUTES = 5;

export function generateAppLoginCode(): string {
  let code = "";
  for (let i = 0; i < APP_LOGIN_CODE_LENGTH; i += 1) {
    code += APP_LOGIN_CODE_ALPHABET[randomInt(APP_LOGIN_CODE_ALPHABET.length)];
  }
  return code;
}

/** « ABCDEFGH » → « ABCD-EFGH », pour l'affichage. */
export function formatAppLoginCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Ce que l'app envoie : sans tiret ni espace, en majuscules. */
export function normalizeAppLoginCode(input: string): string {
  return input.replace(/[\s-]/g, "").toUpperCase();
}
