/**
 * Liste de souhaits au format texte, telle que la modale d'export la donne à
 * copier :
 *
 * ```
 * Elzar Mann, Hanté Par Une Vision 829 (ASH)
 * 2x Kelleran Beq, Où Sont Les Autres ? 12 (ASH)
 * ```
 *
 * Le nom seul ne suffit pas à désigner ce qu'on cherche : une carte est
 * rééditée d'une extension à l'autre, et c'est bien une impression précise
 * qu'on veut se voir proposer. Le numéro de collection et le code d'extension
 * ferment donc la ligne, dans l'ordre où on les lit sur la carte.
 *
 * La quantité ouvre la ligne, comme dans l'export d'un paquet de cube et dans
 * la liste texte d'un échange : elle ne coupe pas la carte de ses références.
 * Un seul exemplaire ne s'écrit pas — c'est le cas courant d'une liste de
 * souhaits, et le dire à chaque ligne n'apprendrait rien.
 */

/** Ce qu'une ligne d'export dit d'une carte souhaitée. */
export type WishlistExportCard = {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  quantity?: number;
};

/**
 * Une ligne d'export. Les références manquantes sont simplement absentes : une
 * entrée qui ne porte pas son extension vaut mieux tronquée que suivie de
 * parenthèses vides.
 */
export function formatWishlistLine(card: WishlistExportCard): string {
  const quantity = card.quantity && card.quantity > 1 ? `${card.quantity}x ` : "";
  const collectorNumber = card.collectorNumber?.trim();
  const setCode = card.setCode?.trim();

  return [
    `${quantity}${card.name.trim()}`,
    collectorNumber || null,
    setCode ? `(${setCode})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** La liste entière, une carte par ligne, dans l'ordre reçu. */
export function formatWishlistText(cards: WishlistExportCard[]): string {
  return cards.map(formatWishlistLine).join("\n");
}
