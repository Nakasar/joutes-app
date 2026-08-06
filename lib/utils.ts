import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUserNamme() {
  const adjectives = ["Sombre", "Lumineux", "Rapide", "Furtif", "Puissant", "Mystérieux", "Élégant", "Féroce", "Agile", "Sage"];
  const nouns = ["Dragon", "Phénix", "Loup", "Tigre", "Serpent", "Griffon", "Licorne", "Chimère", "Hydre", "Sphinx"];

  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  return `${randomAdjective}${randomNoun}`;
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


/**
 * Rend une URL saisie par un utilisateur sûre à placer dans un `href`.
 * `javascript:` (ou tout autre schéma que http/https) devient du script exécuté
 * dans l'origine du site dès qu'un visiteur clique le lien. Les saisies sont
 * validées par `httpUrlSchema`, mais les valeurs enregistrées avant cette
 * validation restent en base : on filtre donc aussi au rendu.
 *
 * @returns L'URL si elle est en http/https, `null` sinon (ne pas rendre le lien)
 */
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  try {
    const protocol = new URL(url).protocol;
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Nom d'hôte d'une URL, pour afficher un lien externe de façon compacte.
 * Rend `null` si l'URL n'est pas exploitable.
 */
export function externalUrlHostname(url: string | null | undefined): string | null {
  const safe = safeExternalUrl(url);
  if (!safe) {
    return null;
  }
  try {
    return new URL(safe).hostname;
  } catch {
    return null;
  }
}
