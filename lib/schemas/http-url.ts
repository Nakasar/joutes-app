import { z } from "zod";

/** Vrai si `value` est une adresse complète en `http:` ou `https:`. */
export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Une adresse web que l'on affichera en lien.
 *
 * `z.string().url()` et `z.url()` acceptent tout ce que `new URL` sait lire,
 * donc aussi `javascript:alert(1)` ou `data:…`. Une telle valeur, enregistrée
 * puis rendue dans un `href`, s'exécute au clic partout où rien ne la bloque :
 * un message Discord, l'application mobile, un client de l'API. On ne garde
 * donc que le web.
 */
export function httpUrl(message = "L'URL doit être valide") {
  return z.string().trim().max(2048, "L'adresse est trop longue").refine(isHttpUrl, message);
}
