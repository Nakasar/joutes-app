import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents";
import { deckCardIds } from "@/lib/decks/contents";
import { CARD_COST_KEYS, toDeckCardInfo, type RawCard } from "@/lib/decks/card-info";
import { normalizeCardName } from "@/lib/decks/text";
import { getCardnexusProductIds } from "@/lib/db/card-prices";
import { copyPriceKey } from "@/lib/prices/copies";
import { deckCardnexusOrder, deckOrderLines, type DeckCardnexusOrder } from "@/lib/decks/cardnexus-order";
import type { DeckZone } from "@/lib/decks/zones";

type CardDoc = RawCard & { id: string; name: string };

const DECK_CARD_PROJECTION = {
  _id: 0,
  id: 1,
  name: 1,
  image: 1,
  type: 1,
  setCode: 1,
  collectorNumber: 1,
  domain: 1,
  orientation: 1,
  ...Object.fromEntries(CARD_COST_KEYS.map((key) => [key, 1])),
} as const;

/**
 * Les cartes d'un deck, telles que ses écrans les affichent.
 *
 * Une seule requête pour tout le deck : la fiche en montre soixante d'un coup,
 * et les charger une par une ferait autant d'allers-retours que de vignettes.
 */
export async function getDeckCardInfos(gameId: string, cardIds: string[]): Promise<DeckCardInfo[]> {
  if (cardIds.length === 0 || !ObjectId.isValid(gameId)) {
    return [];
  }

  const docs = await db
    .collection<CardDoc & { gameId: ObjectId }>("cards")
    .find({ gameId: new ObjectId(gameId), id: { $in: cardIds } }, { projection: DECK_CARD_PROJECTION })
    .toArray();

  // Un même identifiant peut exister en plusieurs langues : la première
  // occurrence suffit, elles partagent illustration et attributs.
  const byId = new Map<string, DeckCardInfo>();
  for (const doc of docs) {
    if (!byId.has(doc.id)) {
      byId.set(doc.id, toDeckCardInfo(doc));
    }
  }

  return [...byId.values()];
}

/** Le contenu d'un deck, résolu contre le catalogue de son jeu. */
export async function getDeckCatalog(deck: { gameId: string; cards?: DeckCards }): Promise<Map<string, DeckCardInfo>> {
  const infos = await getDeckCardInfos(deck.gameId, deckCardIds(deck.cards));
  return new Map(infos.map((info) => [info.id, info]));
}

/**
 * Apparie des noms de carte à des identifiants du catalogue.
 *
 * Sert à l'onglet « Texte » de l'éditeur : la comparaison se fait sur le nom
 * normalisé (sans casse ni accents), et la recherche part de la forme brute
 * pour laisser Mongo utiliser son index avant de retomber sur la normalisation.
 */
export async function resolveCardIdsByName(
  gameId: string,
  names: string[]
): Promise<Map<string, DeckCardInfo>> {
  if (names.length === 0 || !ObjectId.isValid(gameId)) {
    return new Map();
  }

  const docs = await db
    .collection<CardDoc & { gameId: ObjectId }>("cards")
    .find({ gameId: new ObjectId(gameId), name: { $in: names } }, { projection: DECK_CARD_PROJECTION })
    .collation({ locale: "fr", strength: 1 })
    .toArray();

  const byName = new Map<string, DeckCardInfo>();
  for (const doc of docs) {
    const key = normalizeCardName(doc.name);
    if (!byName.has(key)) {
      byName.set(key, toDeckCardInfo(doc));
    }
  }

  return byName;
}

/**
 * Domaines couverts par un deck, pour que la librairie puisse s'y filtrer sans
 * relire le catalogue à chaque recherche.
 *
 * Recalculés à chaque enregistrement du contenu : c'est une valeur dérivée, pas
 * une saisie de l'auteur.
 */
export async function deriveDeckDomains(gameId: string, cards: DeckCards | undefined): Promise<string[]> {
  const infos = await getDeckCardInfos(gameId, deckCardIds(cards));
  const domains = new Set<string>();

  for (const info of infos) {
    for (const domain of info.domain ?? []) {
      domains.add(domain);
    }
  }

  return [...domains].sort((a, b) => a.localeCompare(b, "fr"));
}

/**
 * Le lien pour commander le deck entier sur CardNexus, et ce qu'il couvre
 * (cf. `lib/decks/cardnexus-order.ts`). Les produits se lisent sur les relevés
 * de prix du jeu du deck.
 */
export async function getDeckCardnexusOrder(
  deck: { gameId: string; cards?: DeckCards },
  zones: DeckZone[]
): Promise<DeckCardnexusOrder> {
  const lines = deckOrderLines(deck.cards, zones);
  if (lines.length === 0 || !ObjectId.isValid(deck.gameId)) {
    return { matched: 0, total: lines.length };
  }

  const productIds = await getCardnexusProductIds(new ObjectId(deck.gameId), lines);
  return deckCardnexusOrder(lines, (line) => productIds.get(copyPriceKey(line.cardId)));
}
