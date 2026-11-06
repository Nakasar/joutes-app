import "server-only";
import { ObjectId } from "mongodb";
import db from "@/lib/mongodb";
import { getCatalogLanguages, getGameCardFilterFacets } from "@/lib/db/cards";
import { getGameLanguages } from "@/lib/constants/card-languages";
import { parseCardSearchCriteria, type CardFilterFacet } from "@/lib/cards/search-filters";
import type { SearchField } from "@/lib/cards/search-syntax";
import { collectionSearchFields, parseCollectionQuery, type CollectionQuery } from "@/lib/collection/query";

/** Ce qu'il faut pour lire une recherche de collection : les facettes du jeu et le vocabulaire qui en découle. */
export type CollectionSearchSetup = {
  facets: CardFilterFacet[];
  fields: SearchField[];
};

async function distinctStrings(field: string, gameId: ObjectId): Promise<string[]> {
  const values = (await db.collection("cards").distinct(field, { gameId })) as unknown[];
  return values.filter((value): value is string => typeof value === "string" && value.length > 0).sort();
}

/**
 * Les facettes et le vocabulaire de recherche d'un jeu, tels que la galerie de
 * cartes les lit : la collection reconnaît ainsi exactement les mêmes champs.
 */
export async function getCollectionSearchSetup(game: { id: string; languages?: string[] }): Promise<CollectionSearchSetup> {
  const gameId = new ObjectId(game.id);
  const [facets, setCodes, types, languages] = await Promise.all([
    getGameCardFilterFacets(gameId),
    distinctStrings("setCode", gameId),
    distinctStrings("type", gameId),
    game.languages !== undefined
      ? Promise.resolve(getGameLanguages(game))
      : getCatalogLanguages(game.id).then((values) => getGameLanguages(game, values)),
  ]);
  return { facets, fields: collectionSearchFields(facets, { setCodes, types, languages }) };
}

/**
 * La recherche d'une requête de collection : `search` (la saisie, avec sa
 * syntaxe) et les filtres du panneau (`in_*`, `min_*`, `max_*`). Renvoie
 * `undefined` quand il n'y a rien à chercher.
 */
export function collectionQueryFromParams(
  params: URLSearchParams,
  setup: CollectionSearchSetup
): CollectionQuery | undefined {
  const search = params.get("search")?.trim() ?? "";
  const criteria = parseCardSearchCriteria(params, setup.facets);
  const hasCriteria = Object.keys(criteria.ranges).length > 0 || Object.keys(criteria.values).length > 0;
  if (!search && !hasCriteria) return undefined;
  return parseCollectionQuery(search, setup.fields, setup.facets, criteria);
}
