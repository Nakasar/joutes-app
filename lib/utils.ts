import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Génère un discriminateur aléatoire à 4 chiffres (0000-9999)
 * @returns Un string de 4 chiffres
 */
export function generateDiscriminator(): string {
  const randomNumber = Math.floor(Math.random() * 10000);
  return randomNumber.toString().padStart(4, '0');
}

/**
 * Formate le nom d'utilisateur complet avec le discriminateur
 * @param displayName Le nom d'utilisateur personnalisé
 * @param discriminator Le discriminateur à 4 chiffres
 * @returns Le nom d'utilisateur formaté (ex: "Username#1234")
 */
export function formatFullUsername(displayName?: string, discriminator?: string): string {
  if (!displayName || !discriminator) {
    return "Non défini";
  }
  return `${displayName}#${discriminator}`;
}

