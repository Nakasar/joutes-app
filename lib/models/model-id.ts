/**
 * L'identifiant d'un modèle, tel qu'il se saisit dans l'administration.
 *
 * Hors `server-only` à dessein : le formulaire s'en sert pour borner sa saisie,
 * l'action serveur pour refuser la sienne. Rien ici ne touche à la base ni aux
 * droits.
 */

/** Longueur au-delà de laquelle un identifiant de modèle n'en est plus un. */
export const MODEL_ID_MAX_LENGTH = 100;

/**
 * L'identifiant part tel quel au fournisseur : on ne vérifie pas qu'il existe
 * — seul un appel réel le dira — mais on écarte ce qui ne peut pas en être un.
 *
 * La barre oblique est admise : certains fournisseurs nomment leurs modèles
 * `éditeur/modèle`.
 */
export function isValidModelId(modelId: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$/.test(modelId) && modelId.length <= MODEL_ID_MAX_LENGTH;
}
