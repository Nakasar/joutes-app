/**
 * Le rapprochement souhaits ↔ ventes d'un groupe.
 *
 * Un membre a mis une carte dans une liste de souhaits du groupe, un *autre*
 * membre a mis la même carte dans la liste de vente : voilà un échange
 * possible. Rien de plus n'est décidé ici — ni prix, ni réservation : la
 * fonction ne fait que nommer les rapprochements, et les deux membres
 * s'arrangent entre eux.
 */

export type TradeCandidateWish = {
  cardId: string;
  name: string;
  gameName?: string;
  image?: string;
  /** Le membre qui cherche la carte. */
  addedByUserId?: string;
};

export type TradeCandidateOffer = {
  cardId: string;
  /** Le membre qui la vend. */
  addedByUserId?: string;
  price?: number;
  currency?: string;
};

export type TradeMatch = {
  cardId: string;
  name: string;
  gameName?: string;
  image?: string;
  /** Celui qui cherche. */
  seekerId: string;
  /** Celui qui l'a. */
  holderId: string;
  price?: number;
  currency?: string;
};

/**
 * Les rapprochements, au plus un par couple (carte, chercheur, détenteur).
 *
 * Un souhait sans auteur connu est ignoré : sans savoir *qui* cherche, on ne
 * peut ni exclure le vendeur lui-même, ni afficher la phrase « Sam cherche —
 * Yann l'a » qui fait tout l'intérêt du bloc.
 */
export function matchWishesToOffers(
  wishes: TradeCandidateWish[],
  offers: TradeCandidateOffer[],
): TradeMatch[] {
  const offersByCardId = new Map<string, TradeCandidateOffer[]>();
  for (const offer of offers) {
    if (!offer.addedByUserId) {
      continue;
    }

    const list = offersByCardId.get(offer.cardId) ?? [];
    list.push(offer);
    offersByCardId.set(offer.cardId, list);
  }

  const seen = new Set<string>();
  const matches: TradeMatch[] = [];

  for (const wish of wishes) {
    if (!wish.addedByUserId) {
      continue;
    }

    for (const offer of offersByCardId.get(wish.cardId) ?? []) {
      // Un membre qui vend une carte qu'il a lui-même mise en souhait n'a
      // personne à qui l'échanger.
      if (offer.addedByUserId === wish.addedByUserId) {
        continue;
      }

      const key = `${wish.cardId}:${wish.addedByUserId}:${offer.addedByUserId}`;
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      matches.push({
        cardId: wish.cardId,
        name: wish.name,
        gameName: wish.gameName,
        image: wish.image,
        seekerId: wish.addedByUserId,
        holderId: offer.addedByUserId as string,
        price: offer.price,
        currency: offer.currency,
      });
    }
  }

  return matches;
}
