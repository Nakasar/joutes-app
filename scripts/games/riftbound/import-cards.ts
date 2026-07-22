import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import db from "../../../lib/mongodb.ts";
import {ObjectId} from "mongodb";
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import meilisearch, {indexes} from "../../../lib/meilisearch.ts";
import {inspect} from "node:util";

const __dirname = dirname(fileURLToPath(import.meta.url));

type WebSiteCard = {
  publicCode: string;
  name: string;
  text?: { label: string; richText: { type: string; body: string } };
  cardType: { label: string; superType: { id: string; label: string }[]; type: { id: string; label: string }[] }
  cardImage: { url: string };
  tags?: { tags: string[] };
};

async function fetchCardsFromWebsite(): Promise<WebSiteCard[]> {
  const res = await fetch('https://riftbound.leagueoflegends.com/en-us/card-gallery/#card-gallery--unl-132-219');

  const html = await res.text();

  const propsRegex = /<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/;
  const match = html.match(propsRegex);

  if (match) {
    const json = match[1];

    const data = JSON.parse(json);

    const cards = data.props.pageProps.page.blades[2].cards.items;

    await writeFile(path.join(__dirname, 'cards.json'), JSON.stringify(cards));

    return cards;
  }

  throw new Error("No cards found on website.");
}

async function getCardsFromJson(): Promise<WebSiteCard[]> {
  const cards = readFile(path.join(__dirname, 'cards.json'), 'utf-8');

  return JSON.parse(await cards);
}

async function main() {
  const cardsRaw = await getCardsFromJson();

  const cards = cardsRaw.map(card => {
    const codeRegex = /(?<set>[A-Z]{3})-(?<cn>[A-Z0-9]{3}[a*]?)(?:\/[0-9]{3})?/;

    const match = card.publicCode.match(codeRegex);

    if (!match) {
      throw new Error(`Invalid card code: ${card.publicCode}`);
    }

    const isLegend = card.cardType.type?.[0]?.label === 'Legend';
    const tag = card.tags?.tags?.[0];

    return {
      id: `${match.groups?.set}${match.groups?.cn}`,
      name: (isLegend && tag) ? `${tag}, ${card.name}` : card.name,
      type: card.cardType.type[0]?.label,
      tags: card.tags?.tags,
      superType: card.cardType.superType?.[0]?.label,
      isToken: card.cardType.superType?.[0]?.label === 'Token',
      image: card.cardImage?.url,
      text: card.text?.richText.body.replaceAll('<p>', '').replaceAll('</p>', '').replaceAll('<br />', '\n'),
      setCode: match.groups?.set,
      collectorNumber: match.groups?.cn,
      lang: 'en',
      gameId: new ObjectId('69009afea722eab4fa0e55c4'),
    };
  });

  const cardsIndex = meilisearch.index(indexes.riftbound.name);
  await cardsIndex.deleteAllDocuments();

  await cardsIndex.addDocuments(cards.map(c => ({
    ...c,
    id: c.id.replaceAll("*", "s"),
    cardId: c.id,
  })));
  for (const card of cards) {
    await db.collection('cards').updateOne({
      id: card.id,
      gameId: new ObjectId('69009afea722eab4fa0e55c4'),
    }, {
      $set: card,
    }, { upsert: true });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});