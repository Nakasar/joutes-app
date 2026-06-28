import {NextRequest, NextResponse} from "next/server";
import {BoosterCard} from "@/lib/types/booster";
import meilisearch, {indexes} from "@/lib/meilisearch";
import db from "@/lib/mongodb";
import {Game} from "@/lib/types/Game";

type SearchCard = BoosterCard & {
  type?: string;
  poster?: string;
  collector_number?: string;
  set?: string;
  [key: string]: unknown;
};

async function getFilterValues(gameSlug: string): Promise<{ setCodes: string[]; types: string[]; languages: string[] }> {
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

async function search({ gameId, searchQuery, lang, setCode, type, limit, offset }: { gameId: string; searchQuery: string; lang: string; setCode: string; type?: string; limit?: number; offset?: number }): Promise<{
  cards: BoosterCard[];
  total: number;
  setCodes: string[];
  types: string[];
  languages: string[];
}> {
  const indexConfig = indexes[gameId];
  if (!indexConfig) {
    console.error(`No index found for gameId: ${gameId}`);
    return { cards: [], total: 0, setCodes: [], types: [], languages: [] };
  }

  const index = meilisearch.index<SearchCard>(indexConfig.name);

  const queryOptions: { filter: string[]; limit?: number; offset?: number } = { filter: [] };
  let queryString = "";

  if (lang === 'all') {
    // no language filter
  } else if (lang !== 'en') {
    queryOptions.filter.push(
      `lang IN [en, ${lang}]`,
    );
  } else {
    queryOptions.filter.push(
      `lang IN [en]`,
    );
  }

  const setRegex = /(?: e|^e|^set| set):(?<set>[\w*]+)/gm;
  const setResult = setRegex.exec(searchQuery);
  if (setResult?.groups?.set === '*') {
  } else if (setResult?.groups?.set) {
    queryOptions.filter.push(
      `${indexConfig.keys.set} = ${setResult?.groups?.set}`,
    );
  } else if (setCode && setCode !== '*') {
    queryOptions.filter.push(
      `${indexConfig.keys.set} = ${setCode}`,
    );
  }

  const cnRegex = /(?: cn|^cn):(?<cn>[\w*]+)/gm;
  const cnResult = cnRegex.exec(searchQuery);
  if (cnResult?.groups?.cn) {
    queryOptions.filter.push(
      `${indexConfig.keys.collectorNumber} = ${cnResult?.groups?.cn}`,
    );
  } else {
    const queryNumber = parseInt(searchQuery);
    if (!isNaN(queryNumber)) {
      queryString = searchQuery;
    } else {
      queryString = searchQuery;
    }
  }

  if (type) {
    queryOptions.filter.push(`type = ${type}`)
  }

  if (typeof limit === 'number') {
    queryOptions.limit = limit;
  }

  if (typeof offset === 'number') {
    queryOptions.offset = offset;
  }

  const result = await index.search(queryString, queryOptions);
  const cards = result.hits.map(result => ({
    ...result,
    image: (result.image || result.poster) ?? '',
    collectorNumber: String(result[indexConfig.keys.collectorNumber] ?? ''),
    setCode: String(result[indexConfig.keys.set] ?? ''),
    type: typeof result.type === 'string' ? result.type : undefined,
  }));

  const filterValues = await getFilterValues(gameId);

  return {
    cards,
    total: result.estimatedTotalHits ?? cards.length,
    setCodes: filterValues.setCodes,
    types: filterValues.types,
    languages: filterValues.languages,
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

  const result = await search({
    gameId,
    searchQuery,
    lang,
    setCode,
    type,
    limit: shouldPaginate ? limit : undefined,
    offset: shouldPaginate ? offset : undefined,
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
  });
}