import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { searchDecks } from "@/lib/db/decks";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { deckCardIds, zoneEntries, type DeckCardInfo } from "@/lib/decks/contents";
import type { CompanionCard, CompanionGame } from "@/lib/companion/state";

/**
 * Ce que le compagnon reprend d'un deck : les cartes qui se posent sur la table
 * avant la première pioche. La légende et les champs de bataille à Riftbound,
 * le leader et la base à Star Wars: Unlimited, le commandant à Magic.
 */
export type CompanionDeck = {
  id: string;
  name: string;
  legend?: CompanionCard;
  battlefields?: CompanionCard[];
  leader?: CompanionCard;
  base?: CompanionCard;
  commander?: CompanionCard;
};

const DECK_LIMIT = 30;

function hasType(card: DeckCardInfo, type: string): boolean {
  const wanted = type.toLowerCase();
  return card.type?.toLowerCase() === wanted || (card.types ?? []).some((t) => t.toLowerCase() === wanted);
}

function toCompanionCard(card: DeckCardInfo, extra?: { hp?: unknown; backImage?: unknown }): CompanionCard {
  return {
    id: card.id,
    name: card.name,
    ...(card.image ? { image: card.image } : {}),
    ...(card.orientation ? { orientation: card.orientation } : {}),
    ...(typeof extra?.hp === "number" ? { hp: extra.hp } : {}),
    ...(typeof extra?.backImage === "string" && extra.backImage ? { backImage: extra.backImage } : {}),
  };
}

/**
 * Les decks du joueur pour ce jeu, les plus récents d'abord, réduits à leurs
 * cartes d'identité. Un deck qui n'en a aucune n'est pas proposé : le choisir
 * ne remplirait rien.
 */
export async function listCompanionDecks(
  game: CompanionGame,
  gameId: string,
  userId: string,
): Promise<CompanionDeck[]> {
  const { decks } = await searchDecks({ scope: "mine", viewerId: userId, gameId, limit: DECK_LIMIT });
  const ids = [...new Set(decks.flatMap((deck) => deckCardIds(deck.cards)))];
  const infos = new Map((await getDeckCardInfos(gameId, ids)).map((info) => [info.id, info]));

  // Les PV d'une base et la face unité d'un leader ne font pas partie de ce
  // qu'un deck lit d'une carte : on les relit à part, seulement pour SWU.
  const extras = new Map<string, { hp?: unknown; backImage?: unknown }>();
  if (game === "swu" && ObjectId.isValid(gameId)) {
    const wanted = [...infos.values()].filter((c) => hasType(c, "Base") || hasType(c, "Leader")).map((c) => c.id);
    if (wanted.length > 0) {
      const docs = await db
        .collection<{ id: string; hp?: unknown; backImage?: unknown }>("cards")
        .find({ gameId: new ObjectId(gameId), id: { $in: wanted } }, { projection: { _id: 0, id: 1, hp: 1, backImage: 1 } })
        .toArray();
      for (const doc of docs) if (!extras.has(doc.id)) extras.set(doc.id, doc);
    }
  }

  const card = (id: string) => {
    const info = infos.get(id);
    return info ? toCompanionCard(info, extras.get(id)) : undefined;
  };

  return decks.flatMap((deck): CompanionDeck[] => {
    const base = { id: deck.id, name: deck.name };
    if (game === "riftbound") {
      const legend = zoneEntries(deck.cards, "legend").map((e) => card(e.cardId)).find(Boolean);
      const battlefields = zoneEntries(deck.cards, "battlefields")
        .map((e) => card(e.cardId))
        .filter((c): c is CompanionCard => !!c)
        .slice(0, 3);
      return legend || battlefields.length > 0 ? [{ ...base, legend, battlefields }] : [];
    }
    const all = deckCardIds(deck.cards).map((id) => infos.get(id)).filter((c): c is DeckCardInfo => !!c);
    if (game === "swu") {
      const leader = all.find((c) => hasType(c, "Leader"));
      const baseCard = all.find((c) => hasType(c, "Base"));
      return leader || baseCard
        ? [{ ...base, leader: leader && card(leader.id), base: baseCard && card(baseCard.id) }]
        : [];
    }
    const commander = zoneEntries(deck.cards, "legend").map((e) => card(e.cardId)).find(Boolean);
    return commander ? [{ ...base, commander }] : [];
  });
}
