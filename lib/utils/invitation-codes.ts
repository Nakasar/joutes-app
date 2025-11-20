import { randomBytes } from "crypto";

/**
 * Génère un code d'invitation unique pour un lair privé
 * @returns Un code d'invitation sécurisé
 */
export function generateInvitationCode(): string {
  // Génère 16 bytes aléatoires et les convertit en hexadécimal
  return randomBytes(16).toString("hex");
}

/**
 * Valide le format d'un code d'invitation
 * @param code - Le code à valider
 * @returns True si le code est valide, false sinon
 */
export function isValidInvitationCode(code: string): boolean {
  // Un code d'invitation valide est une chaîne hexadécimale de 32 caractères
  return /^[0-9a-f]{32}$/.test(code);
}
