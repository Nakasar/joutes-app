/**
 * Ce que le navigateur et le serveur doivent tous deux savoir d'un dépôt
 * d'image de liste de deck. Aucune règle d'autorisation ici : ce module part
 * dans le bundle client, et la liste des administrateurs n'a rien à y faire —
 * elle vit dans `deck-image-access.ts`, côté serveur uniquement.
 */

/** Le dossier du magasin de blobs où atterrissent les photos de listes. */
export const DECK_IMAGE_PATH_PREFIX = 'deck-images/';

export const DECK_IMAGE_ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const DECK_IMAGE_MAX_SIZE = 10 * 1024 * 1024; // 10 Mo

/**
 * Le nom du fichier choisi par l'utilisateur devient un segment d'URL : tout
 * ce qui n'est pas alphanumérique, point, tiret ou souligné est remplacé, et
 * un nom vide reçoit un repli. Le suffixe aléatoire posé par le serveur au
 * moment d'émettre le jeton règle l'unicité — ceci ne règle que la forme.
 */
export function deckImageUploadPathname(fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[-.]+/, '');

  return `${DECK_IMAGE_PATH_PREFIX}${safeName || 'deck-list'}`;
}
