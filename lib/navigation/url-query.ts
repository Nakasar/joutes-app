/**
 * L'état d'une recherche (saisie, filtres, page) vit dans l'adresse.
 *
 * C'est ce qui permet d'ouvrir une fiche puis de revenir en arrière sans rien
 * perdre : le navigateur rend l'adresse exacte qu'on avait quittée, et la page
 * se reconstruit depuis elle. Un lien copié ouvre aussi les mêmes résultats.
 *
 * Ce module est lu côté serveur (rendu de la première page) comme côté client :
 * il ne dépend que de `URLSearchParams`.
 */

/** Paramètres de recherche tels que Next les passe à une page. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Les paramètres d'une page Next, sous la forme commune à tout le reste. */
export function toURLSearchParams(raw: RawSearchParams | URLSearchParams): URLSearchParams {
  if (raw instanceof URLSearchParams) return new URLSearchParams(raw);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      for (const entry of value) params.append(key, entry);
    } else if (value !== undefined) {
      params.set(key, value);
    }
  }
  return params;
}

/** Numéro de page lu dans l'adresse : tout ce qui n'est pas un entier ≥ 1 vaut 1. */
export function readPage(params: URLSearchParams, key = "page"): number {
  const parsed = Number.parseInt(params.get(key) ?? "", 10);
  return Number.isFinite(parsed) && parsed > 1 ? parsed : 1;
}

/** La page n'est écrite qu'au-delà de la première : l'adresse par défaut reste nue. */
export function writePage(params: URLSearchParams, page: number, key = "page"): void {
  if (page > 1) params.set(key, String(page));
}

/** Une valeur lue dans l'adresse, retenue seulement si elle fait partie des choix permis. */
export function readChoice<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = params.get(key);
  return value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/**
 * Deux états de recherche équivalents, à la valeur près.
 *
 * Un écran ne relance sa recherche que si ce qu'on lui demande diffère de ce
 * qu'il montre déjà. Un drapeau « premier rendu » ne suffit pas : React rejoue
 * les effets en développement, et Next les rejoue aussi quand on revient sur
 * une page gardée en mémoire — l'écran repartirait alors à la première page.
 */
export function sameQuery(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
