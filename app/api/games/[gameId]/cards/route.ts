import {NextRequest, NextResponse} from "next/server";
import {BoosterCard} from "@/lib/types/booster";
import meilisearch, {indexes} from "@/lib/meilisearch";

async function search({ gameId, searchQuery, lang, setCode, type }: { gameId: string; searchQuery: string; lang: string; setCode: string; type?: string }): Promise<BoosterCard[]> {
  const indexConfig = indexes[gameId];
  if (!indexConfig) {
    console.error(`No index found for gameId: ${gameId}`);
    return [];
  }

  const index = meilisearch.index<BoosterCard & {
    poster?: string;
    collector_number?: string;
    set?: string;
    [key: string]: any;
  }>(indexConfig.name);

  const queryOptions: { filter: string[] } = {filter: []};
  let queryString = "";

  if (searchQuery.includes(' lang:')) {

  } else if (lang !== 'en') {
    queryOptions.filter.push(
      `lang IN [en, ${lang}]`,
    );
  } else {
    queryOptions.filter.push(
      `lang IN [en]`,
    );
  }


  const setRegex = /(?: e|^e|^set| set):(?<set>[\w\*]+)/gm;
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

  const cnRegex = /(?: cn|^cn):(?<cn>[\w\*]+)/gm;
  const cnResult = cnRegex.exec(searchQuery);
  if (cnResult?.groups?.cn) {
    queryOptions.filter.push(
      `${indexConfig.keys.collectorNumber} = ${cnResult?.groups?.cn}`,
    );
  } else {
    const queryNumber = parseInt(searchQuery);
    if (!isNaN(queryNumber)) {
      queryString = searchQuery;
      // queryOptions.filter.push(
      //   `${indexConfig.keys.collectorNumber} CONTAINS "${queryNumber}"`,
      // );
    } else {
      queryString = searchQuery;
    }
  }

  if (type) {
    queryOptions.filter.push(`type = ${type}`)
  }

  const result = await index.search(queryString, queryOptions);

  return result.hits.map(result => ({
    ...result,
    image: (result.image || result.poster) ?? '',
    collectorNumber: result[indexConfig.keys.collectorNumber],
    setCode: result[indexConfig.keys.set],
  }));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await params;

  const searchParams = new URL(request.url).searchParams;
  const setCode = searchParams.get('setCode') || '';
  const searchQuery = searchParams.get('searchQuery') || '';
  const lang = searchParams.get('lang') || 'en';
  const type = searchParams.get('type') || undefined;

  const cards = await search({
    gameId,
    searchQuery,
    lang,
    setCode,
    type,
  });

  return NextResponse.json(cards);
}