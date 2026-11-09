import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { META_IMPORT_AUTHOR } from "@/lib/db/decks";
import type { DeckCards } from "@/lib/decks/contents";
import riftboundSets from "@/data/riftbound/sets.json";
import { metaCacheTag } from "@/lib/meta/cache";
import { computeDeckDomains, playableDomains } from "@/lib/decks/domains";
import type { MetaCard, MetaSample, MetaSampleDeck } from "@/lib/meta/stats";
import type { DeckMeta } from "@/lib/types/Deck";

/**
 * Les zones qui ne disent rien des choix d'un joueur : la légende se compte à
 * part, les runes suivent les domaines, la réserve dépend des adversaires.
 */
const UNCOUNTED_ZONES = new Set(["legend", "runes", "sideboard"]);

const SET_NAMES_BY_GAME: Record<string, { setCode: string; name: string }[]> = {
  riftbound: riftboundSets,
};

/** Les extensions connues d'un jeu, dans l'ordre de sortie. */
export function knownGameSets(gameSlug: string | undefined): { setCode: string; name: string }[] {
  return (SET_NAMES_BY_GAME[gameSlug ?? ""] ?? []).map((set) => ({ setCode: set.setCode, name: set.name }));
}

type MetaDeckDoc = {
  _id: ObjectId;
  gameId: string;
  visibility: string;
  name: string;
  legendCardId?: string;
  legendName?: string;
  domains?: string[];
  coverImage?: string;
  cards?: DeckCards;
  meta: DeckMeta;
};

/**
 * L'échantillon de la méta d'un jeu : ses decks méta **publics**, et les
 * cartes qu'ils jouent.
 *
 * Mis en cache par jeu, invalidé par toute écriture de la gestion de la méta
 * (`metaCacheTag`). Un joueur peut aussi modifier ou dépublier son deck marqué
 * sans passer par là : `cacheLife("hours")` borne ce retard.
 */
export async function loadMetaSample(gameId: string, gameSlug?: string): Promise<MetaSample> {
  "use cache";
  cacheTag(metaCacheTag(gameId));
  cacheLife("hours");

  const docs = await db
    .collection<MetaDeckDoc>("decks")
    .find(
      { gameId, visibility: "public", meta: { $exists: true } },
      {
        projection: { _id: 1, name: 1, legendCardId: 1, legendName: 1, domains: 1, coverImage: 1, cards: 1, meta: 1 },
      }
    )
    .toArray();

  // Un deck sans date de tournoi lisible n'a pas sa place dans une période : on l'écarte.
  const dated = docs.filter((doc) => !Number.isNaN(new Date(doc.meta?.eventDate as Date).getTime()));
  const decks: MetaSampleDeck[] = dated.map((doc) => ({
    id: doc._id.toString(),
    name: doc.name,
    ...(doc.legendCardId ? { legendCardId: doc.legendCardId } : {}),
    ...(doc.legendName ? { legendName: doc.legendName } : {}),
    domains: doc.domains ?? [],
    source: doc.meta.source,
    eventDate: new Date(doc.meta.eventDate).toISOString(),
    ...(doc.meta.placement ? { placement: doc.meta.placement } : {}),
    ...(doc.meta.imported ? { pilot: doc.meta.pilot || META_IMPORT_AUTHOR } : {}),
    ...(doc.coverImage ? { coverImage: doc.coverImage } : {}),
    cards: Object.entries(doc.cards ?? {})
      .filter(([zone]) => !UNCOUNTED_ZONES.has(zone))
      .flatMap(([, entries]) => entries ?? []),
  }));

  // La fiche des légendes aussi : leur image et leurs domaines s'affichent.
  const cardIds = [
    ...new Set([
      ...decks.flatMap((deck) => deck.cards.map((entry) => entry.cardId)),
      ...decks.flatMap((deck) => (deck.legendCardId ? [deck.legendCardId] : [])),
    ]),
  ];
  const infos = await getDeckCardInfos(gameId, cardIds);
  const cards: Record<string, MetaCard> = Object.fromEntries(
    infos.map((info) => [
      info.id,
      {
        id: info.id,
        name: info.name,
        ...(info.image ? { image: info.image } : {}),
        ...(info.type ? { type: info.type } : {}),
        ...(info.setCode ? { setCode: info.setCode } : {}),
        // « Colorless » n'est pas un domaine : une carte incolore n'en a aucun.
        domains: playableDomains(info.domain),
      },
    ])
  );

  const setTotals = await countCardsBySet(gameId);
  const setNames = Object.fromEntries(
    (SET_NAMES_BY_GAME[gameSlug ?? ""] ?? []).map((set) => [set.setCode, set.name])
  );

  // Les domaines enregistrés sur un deck ont longtemps compté les champs de
  // bataille et la réserve : on les recalcule ici, depuis la légende, sur le
  // contenu complet du deck.
  const docsById = new Map(dated.map((doc) => [doc._id.toString(), doc]));
  for (const deck of decks) {
    const doc = docsById.get(deck.id);
    const computed = computeDeckDomains(doc?.cards, (cardId) => cards[cardId]?.domains, deck.legendCardId);
    deck.domains = computed.length > 0 ? computed : playableDomains(deck.domains);
  }

  return { decks, cards, setTotals, setNames };
}

/** Le nombre de cartes différentes au catalogue, par extension. */
async function countCardsBySet(gameId: string): Promise<Record<string, number>> {
  if (!ObjectId.isValid(gameId)) return {};
  const rows = await db
    .collection("cards")
    .aggregate<{ _id: string; total: number }>([
      { $match: { gameId: new ObjectId(gameId), setCode: { $exists: true, $ne: null } } },
      { $group: { _id: { set: "$setCode", id: "$id" } } },
      { $group: { _id: "$_id.set", total: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((row) => [row._id, row.total]));
}
