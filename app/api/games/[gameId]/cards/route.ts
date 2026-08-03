import {NextRequest, NextResponse} from "next/server";
import {BoosterCard} from "@/lib/types/booster";
import meilisearch, {cardIndexFor, isUndeclaredCriteriaError} from "@/lib/meilisearch";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";
import {getGameCardFilterFacets} from "@/lib/db/cards";
import {
  buildFacetFilters,
  buildSortExpressions,
  parseCardSearchCriteria,
  type CardFilterFacet,
} from "@/lib/cards/search-filters";
import {
  buildSearchFields,
  mergeSearchCriteria,
  parseSearchSyntax,
} from "@/lib/cards/search-syntax";

type CardFilterValues = { setCodes: string[]; types: string[]; languages: string[] };

type SearchCard = BoosterCard & {
  type?: string;
  poster?: string;
  collector_number?: string;
  set?: string;
  [key: string]: unknown;
};

async function getFilterValues(gameSlug: string): Promise<CardFilterValues> {
  const game = await db.collection<Game>("games").findOne({ slug: gameSlug });
  if (!game) {
    return { setCodes: [], types: [], languages: [] };
  }

  const cardsCollection = db.collection<{ setCode?: string; type?: string; lang?: string }>("cards");
  const setCodes = (await cardsCollection.distinct("setCode", { gameId: game._id }))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  const types = (await cardsCollection.distinct("type", { gameId: game._id }))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  const languages = (await cardsCollection.distinct("lang", { gameId: game._id }))
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();

  return { setCodes, types, languages };
}

async function search({ gameId, searchQuery, lang, setCode, type, limit, offset, criteriaParams, facets, filterValues }: { gameId: string; searchQuery: string; lang: string; setCode: string; type?: string; limit?: number; offset?: number; criteriaParams: URLSearchParams; facets: CardFilterFacet[]; filterValues: CardFilterValues }): Promise<{
  cards: BoosterCard[];
  total: number;
  setCodes: string[];
  types: string[];
  languages: string[];
  degraded: boolean;
}> {
  const indexConfig = cardIndexFor(gameId);
  if (!indexConfig) {
    console.error(`No index found for gameId: ${gameId}`);
    return { cards: [], total: 0, setCodes: [], types: [], languages: [], degraded: false };
  }

  const index = meilisearch.index<SearchCard>(indexConfig.name);

  // La saisie peut porter des tokens (`domain:fury energy<=3`) : ils sont lus
  // ici plutôt que côté navigateur, pour qu'un lien partagé s'ouvre déjà
  // filtré, dès le premier rendu. Ce qui n'est pas un token reste le texte
  // cherché — et repart donc dans les filtres historiques ci-dessous.
  const parsedQuery = parseSearchSyntax(searchQuery, buildSearchFields(facets, filterValues));
  const freeText = parsedQuery.text;
  const effectiveLang = parsedQuery.lang ?? lang;
  const effectiveSetCode = parsedQuery.setCode ?? setCode;
  const effectiveType = parsedQuery.type ?? type;

  const queryOptions: { filter: string[]; limit?: number; offset?: number } = { filter: [] };
  let queryString = "";

  if (effectiveLang === 'all') {
    // no language filter
  } else if (effectiveLang !== 'en') {
    queryOptions.filter.push(
      `lang IN [en, ${effectiveLang}]`,
    );
  } else {
    queryOptions.filter.push(
      `lang IN [en]`,
    );
  }

  const setRegex = /(?: e|^e|^set| set):(?<set>[\w*]+)/gm;
  const setResult = setRegex.exec(freeText);
  if (setResult?.groups?.set === '*') {
  } else if (setResult?.groups?.set) {
    queryOptions.filter.push(
      `${indexConfig.keys.set} = ${setResult?.groups?.set}`,
    );
  } else if (effectiveSetCode && effectiveSetCode !== '*') {
    queryOptions.filter.push(
      `${indexConfig.keys.set} = ${effectiveSetCode}`,
    );
  }

  const cnRegex = /(?: cn|^cn):(?<cn>[\w*]+)/gm;
  const cnResult = cnRegex.exec(freeText);
  if (cnResult?.groups?.cn) {
    queryOptions.filter.push(
      `${indexConfig.keys.collectorNumber} = ${cnResult?.groups?.cn}`,
    );
  } else {
    queryString = freeText;
  }

  if (effectiveType) {
    queryOptions.filter.push(`type = ${effectiveType}`)
  }

  if (typeof limit === 'number') {
    queryOptions.limit = limit;
  }

  if (typeof offset === 'number') {
    queryOptions.offset = offset;
  }

  const criteria = mergeSearchCriteria(parseCardSearchCriteria(criteriaParams, facets), parsedQuery.criteria);
  const facetFilters = buildFacetFilters(criteria, facets);
  const sort = buildSortExpressions(criteria, indexConfig.keys);

  // Filtrer ou trier sur un attribut suppose qu'il soit déclaré dans l'index.
  // Tant que la réindexation n'a pas été relancée depuis l'administration, il ne
  // l'est pas : plutôt qu'une page en erreur, on refait la recherche sans ces
  // critères et on le signale à l'appelant.
  //
  // Ce repli est réservé au refus explicite des critères. Une panne — réseau,
  // clé refusée, index absent — doit remonter : la rattraper ici rendrait des
  // résultats non filtrés qui ressemblent à une page qui marche.
  let degraded = false;
  let result;
  try {
    result = await index.search(queryString, {
      ...queryOptions,
      filter: [...queryOptions.filter, ...facetFilters],
      ...(sort.length > 0 ? { sort } : {}),
    });
  } catch (error) {
    if (!isUndeclaredCriteriaError(error) || (facetFilters.length === 0 && sort.length === 0)) {
      throw error;
    }
    console.error("Recherche de cartes : filtres ou tri refusés par l'index", error);
    degraded = true;
    result = await index.search(queryString, queryOptions);
  }
  const cards = result.hits.map(result => ({
    ...result,
    image: (result.image || result.poster) ?? '',
    collectorNumber: String(result[indexConfig.keys.collectorNumber] ?? ''),
    setCode: String(result[indexConfig.keys.set] ?? ''),
    type: typeof result.type === 'string' ? result.type : undefined,
  }));

  return {
    cards,
    total: result.estimatedTotalHits ?? cards.length,
    setCodes: filterValues.setCodes,
    types: filterValues.types,
    languages: filterValues.languages,
    degraded,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const searchParams = new URL(request.url).searchParams;
  const setCode = searchParams.get('setCode') || '';
  const searchQuery = searchParams.get('searchQuery') || '';
  const lang = searchParams.get('lang') || 'all';
  const type = searchParams.get('type') || undefined;
  const pageParam = searchParams.get('page');
  const limitParam = searchParams.get('limit');
  const shouldPaginate = searchParams.has('page') || searchParams.has('limit');
  const page = Math.max(1, Number.parseInt(pageParam ?? '1', 10) || 1);
  const limit = Math.max(1, Math.min(100, Number.parseInt(limitParam ?? '24', 10) || 24));
  const offset = (page - 1) * limit;

  // Les facettes proposées viennent des attributs que portent réellement les
  // cartes du jeu : elles bornent aussi ce que les critères peuvent demander.
  const game = await db.collection<Game>("games").findOne({ slug: gameId });
  // Les valeurs de filtre sont relues avant la recherche, et plus après : la
  // syntaxe de la barre de recherche s'appuie dessus pour reconnaître
  // `set:OGN` ou `type:Unit`.
  const [facets, filterValues] = await Promise.all([
    game ? getGameCardFilterFacets(game._id) : Promise.resolve([]),
    getFilterValues(gameId),
  ]);

  const result = await search({
    gameId,
    searchQuery,
    lang,
    setCode,
    type,
    limit: shouldPaginate ? limit : undefined,
    offset: shouldPaginate ? offset : undefined,
    criteriaParams: searchParams,
    facets,
    filterValues,
  });

  if (!shouldPaginate) {
    return NextResponse.json(result.cards);
  }

  return NextResponse.json({
    cards: result.cards,
    total: result.total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(result.total / limit)),
    setCodes: result.setCodes,
    types: result.types,
    languages: result.languages,
    facets,
    // Vrai quand l'index n'accepte pas encore les filtres d'attributs : les
    // résultats sont alors ceux de la recherche sans eux.
    filtersUnavailable: result.degraded,
  });
}