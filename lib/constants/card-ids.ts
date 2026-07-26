/**
 * Identifiant d'une carte : il est dérivé du code d'extension et du numéro de
 * collection, avec une convention par jeu (Riftbound colle les deux — `SFD125`
 * — quand Star Wars Unlimited les sépare d'un tiret — `SOR-001`), reprise des
 * scripts d'import de chaque jeu.
 *
 * Les jeux absents de la table suivent la concaténation simple ; l'identifiant
 * reste modifiable à la main dans le formulaire d'administration pour les cas
 * qui ne rentrent dans aucune des deux conventions.
 */
const CARD_ID_SEPARATOR_BY_GAME: Record<string, string> = {
  swu: "-",
};

export function cardIdSeparator(gameSlug?: string): string {
  return CARD_ID_SEPARATOR_BY_GAME[gameSlug ?? ""] ?? "";
}

export function buildCardId(gameSlug: string | undefined, setCode: string, collectorNumber: string): string {
  const set = setCode.trim().toUpperCase();
  const number = collectorNumber.trim();
  if (!set || !number) {
    return "";
  }
  return `${set}${cardIdSeparator(gameSlug)}${number}`;
}
