import {readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import db from "../../../lib/mongodb.ts";
import {ObjectId} from "mongodb";
import {dirname} from 'path';
import {fileURLToPath} from 'url';
import meilisearch, {indexes} from "../../../lib/meilisearch.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

type WebSiteValue = { label: string; value?: { id: string | number; label: string } };
type WebSiteValues = { label: string; values?: { id: string; label: string }[] };

type WebSiteCard = {
  publicCode: string;
  name: string;
  text?: { label: string; richText: { type: string; body: string } };
  cardType: { label: string; superType: { id: string; label: string }[]; type: { id: string; label: string }[] }
  cardImage: { url: string };
  tags?: { tags: string[] };
  rarity?: WebSiteValue;
  energy?: WebSiteValue;
  power?: WebSiteValue;
  might?: WebSiteValue;
  domain?: WebSiteValues;
  illustrator?: WebSiteValues;
};

/** `{ value: { id: 3, label: "3" } }` -> 3, en ignorant les valeurs non numériques. */
function numericValue(field?: WebSiteValue): number | undefined {
  const raw = field?.value?.id ?? field?.value?.label;
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** `{ values: [{ label: "Chaos" }] }` -> ["Chaos"], `undefined` si la liste est vide. */
function labels(field?: WebSiteValues): string[] | undefined {
  const values = field?.values?.map((value) => value.label).filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

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
  const cardsRaw = await fetchCardsFromWebsite();

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
      types: card.cardType.type?.map((type) => type.label).filter(Boolean),
      tags: card.tags?.tags,
      superType: card.cardType.superType?.[0]?.label,
      isToken: card.cardType.superType?.[0]?.label === 'Token',
      rarity: card.rarity?.value?.label,
      foil: ['Epic', 'Rare'].includes(card.rarity?.value?.label ?? ''),
      domain: labels(card.domain),
      illustrator: labels(card.illustrator),
      energy: numericValue(card.energy),
      power: numericValue(card.power),
      might: numericValue(card.might),
      image: card.cardImage?.url,
      text: card.text?.richText.body.replaceAll('<p>', '').replaceAll('</p>', '').replaceAll('<br />', '\n'),
      setCode: match.groups?.set,
      collectorNumber: match.groups?.cn,
      lang: 'en',
      // Distingue les cartes importées de celles ajoutées à la main depuis
      // l'administration (`source: 'manual'`).
      source: 'import',
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
    // Une propriété absente de la source (une carte sans énergie, sans domaine…)
    // ne doit pas être écrite en `null` sur le document existant.
    const fields = Object.fromEntries(Object.entries(card).filter(([, value]) => value !== undefined));

    await db.collection('cards').updateOne({
      id: card.id,
      gameId: new ObjectId('69009afea722eab4fa0e55c4'),
    }, {
      $set: fields,
    }, { upsert: true });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});