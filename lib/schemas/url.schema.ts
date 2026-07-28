import { z } from "zod";

// Seuls schémas d'URI autorisés dans les URL saisies par les utilisateurs.
const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * URL saisie par un utilisateur et destinée à être rendue dans un `href`
 * (site web d'un profil, lien de réseau social, site d'un lieu).
 *
 * `z.url()` se contente de vérifier que l'URI est bien formée et accepte donc
 * `javascript:alert(1)`, qui devient du script exécuté dans l'origine du site
 * dès qu'un visiteur clique le lien. On restreint explicitement à http/https.
 */
export function httpUrlSchema(message = "L'URL n'est pas valide") {
  return z.url(message).refine((value) => {
    try {
      return ALLOWED_PROTOCOLS.includes(new URL(value).protocol);
    } catch {
      return false;
    }
  }, message);
}
