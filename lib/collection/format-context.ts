import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import riftboundSets from "@/data/riftbound/sets.json";
import type { CatalogCard, FormatContext } from "@/lib/collection/formats";

/**
 * Noms complets des extensions, par jeu. Seul Riftbound en a aujourd'hui, et
 * seul le format Piltover s'en sert : un jeu sans table ici exporte simplement
 * le code d'extension à la place du nom.
 */
const SET_NAMES_BY_GAME: Record<string, { setCode: string; name: string }[]> = {
  riftbound: riftboundSets,
};

/**
 * Ce dont les formats ont besoin du jeu : son catalogue, pour retrouver une
 * carte à l'import et l'enrichir à l'export, et ses noms d'extensions.
 *
 * Le catalogue est chargé d'un bloc — quelques milliers de cartes au plus par
 * jeu — plutôt qu'interrogé ligne à ligne : un fichier d'import en compte
 * volontiers un millier, ce qui ferait autant d'allers-retours.
 */
export async function buildCollectionFormatContext(game: {
  id: string;
  slug?: string;
}): Promise<FormatContext> {
  const gameSlug = game.slug ?? game.id;

  const cards = await db
    .collection("cards")
    .find(
      { gameId: new ObjectId(game.id) },
      {
        projection: {
          _id: 0,
          id: 1,
          name: 1,
          setCode: 1,
          collectorNumber: 1,
          image: 1,
          rarity: 1,
          foil: 1,
          printings: 1,
        },
      },
    )
    .toArray();

  const catalog: CatalogCard[] = cards.map((card) => ({
    id: String(card.id ?? ""),
    name: String(card.name ?? ""),
    setCode: String(card.setCode ?? ""),
    collectorNumber: String(card.collectorNumber ?? ""),
    image: String(card.image ?? ""),
    ...(card.rarity !== undefined && { rarity: String(card.rarity) }),
    ...(card.foil !== undefined && { foil: card.foil === true }),
    ...(Array.isArray(card.printings) && { printings: card.printings }),
  }));

  const setNames = Object.fromEntries(
    (SET_NAMES_BY_GAME[gameSlug] ?? []).map((set) => [set.setCode, set.name]),
  );

  return { gameSlug, catalog, setNames };
}
