import { customAlphabet } from "nanoid";

// Alphabet lisible : sans caractères ambigus (0/O, 1/I/L).
const FRIEND_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const FRIEND_CODE_LENGTH = 8;

const generateRawFriendCode = customAlphabet(FRIEND_CODE_ALPHABET, FRIEND_CODE_LENGTH);

/**
 * Génère un code ami lisible (ex. ajouté au profil pour partage par QR code).
 */
export function generateFriendCode(): string {
  return generateRawFriendCode();
}

const FRIEND_CODE_PATTERN = new RegExp(`^[${FRIEND_CODE_ALPHABET}]{${FRIEND_CODE_LENGTH}}$`);

export function isValidFriendCode(code: string): boolean {
  return FRIEND_CODE_PATTERN.test(code);
}

/**
 * Extrait un code ami à partir du contenu brut d'un QR code : soit une URL
 * de type `.../friends/add/<code>`, soit le code lui-même.
 */
export function extractFriendCodeFromScan(rawValue: string): string | null {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    candidate = segments[segments.length - 1] || "";
  } catch {
    // Pas une URL : on considère que la valeur scannée est le code brut.
  }

  candidate = candidate.toUpperCase();
  return isValidFriendCode(candidate) ? candidate : null;
}
