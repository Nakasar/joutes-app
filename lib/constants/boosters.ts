/** Longueur maximale d'une note de booster, partagée par la saisie et la validation serveur. */
export const BOOSTER_NOTE_MAX_LENGTH = 500;

/**
 * Nombre de cartes retenues dans une recherche de boosters par contenu. Chaque
 * carte demandée coûte une requête sur `booster-cards` : la borne évite qu'une
 * URL bricolée en déclenche des centaines.
 */
export const BOOSTER_CARD_FILTER_MAX = 10;

/** Identifiants de cartes d'un paramètre `cards`, dédoublonnés et bornés. */
export function parseBoosterCardIds(raw: string | null | undefined): string[] {
  if (!raw) {
    return [];
  }

  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  return [...new Set(ids)].slice(0, BOOSTER_CARD_FILTER_MAX);
}
