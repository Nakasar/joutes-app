import {readFileSync, writeFileSync} from "node:fs";
import path from "node:path";
import {ObjectId} from "mongodb";
import db from "../../../lib/mongodb.ts";
import meilisearch, {indexes} from "../../../lib/meilisearch.ts";

export type Card = {
  id: string;
  imageUrl: string;
  lang: string;
  setCode: "string";
  collectorNumber: "string";
  name: "string";
  subtitle: "string";
  traits: string[];
  type: "string";
  arenas: string[];
  text: "string";
  price?: "string";
  foilPrice?: "string";
  rarity: "string";
  cost: number;
  hp: number;
  power: number;
  token?: boolean;
};

export async function importCardDatabase() {
  console.info('Importing cards database...');

  const cardsIndex = meilisearch.index(indexes.swu.name);
  await cardsIndex.deleteAllDocuments();


  await db.collection('cards').deleteMany({
    gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
  });

  const cardsRaw = await getCardsListFromFile();

  let cards = [];

  const batchSize = 50000;

  for (const cardRaw of cardsRaw) {
    cards.push({
      id: `${cardRaw.setCode}-${cardRaw.token ? `T${String(cardRaw.collectorNumber).padStart(2, '0')}` : cardRaw.collectorNumber}`,
      image: cardRaw.imageUrl,
      lang: cardRaw.lang,
      setCode: cardRaw.setCode,
      collectorNumber: cardRaw.token ? `T${String(cardRaw.collectorNumber).padStart(2, '0')}` : String(cardRaw.collectorNumber),
      name: `${cardRaw.name}${cardRaw.subtitle ? `, ${cardRaw.subtitle}` : ''}`,
      title: cardRaw.name,
      subtitle: cardRaw.subtitle,
      traits: cardRaw.traits,
      type: cardRaw.type,
      arenas: cardRaw.arenas,
      text: cardRaw.text,
      price: cardRaw.price,
      foilPrice: cardRaw.foilPrice,
      rarity: cardRaw.rarity,
      cost: cardRaw.cost,
      hp: cardRaw.hp,
      power: cardRaw.power,
      token: cardRaw.token,
    });

    if (cards.length >= batchSize) {
      await cardsIndex.addDocuments(cards);
      await db.collection('cards').insertMany(cards.map(c => ({
        ...c,
        gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
      })));
      cards = [];

      await new Promise((resolve) => setTimeout(resolve, 60000));
    }
  }

  if (cards.length > 0) {
    await cardsIndex.addDocuments(cards);
    await db.collection('cards').insertMany(cards.map(c => ({
      ...c,
      gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
    })));
  }

  console.info('Cards database imported!')
}

async function getCardsListFromFile(): Promise<Card[]> {
  const cardsRaw: any[] = JSON.parse(readFileSync(path.join(__dirname, './cards.json')).toString());

  return cardsRaw.map(cardRaw => ({
    id: cardRaw.id,
    name: cardRaw.attributes.title,
    subtitle: cardRaw.attributes.subtitle,
    setCode: cardRaw.attributes.expansion.data.attributes.code,
    lang: cardRaw.attributes.locale,
    text: cardRaw.attributes.text,
    power: cardRaw.attributes.power,
    hp: cardRaw.attributes.hp,
    cost: cardRaw.attributes.cost,
    type: cardRaw.attributes.type.data.attributes.value,
    traits: cardRaw.attributes.traits.data.map((trait: any) => trait.attributes.name),
    arenas: cardRaw.attributes.arenas.data.map((arena: any) => arena.attributes.name),
    rarity: cardRaw.attributes.rarity.data.attributes.englishName,
    imageUrl: cardRaw.attributes.artFront.data?.attributes.url,
    collectorNumber: cardRaw.attributes.cardNumber,
    token: cardRaw.attributes.type.data.attributes.value === 'Token',
  }))
}

async function getCardsListFromOfficialWebSite(): Promise<Card[]> {
  const cards = [];

  let page = 1;

  while (true) {
    console.info(`Fetching cards database page ${page}...`);
    const cardsResult = await fetch(`https://admin.starwarsunlimited.com/api/card-list?locale=fr&pagination[page]=${page}&pagination[pageSize]=100`);

    if (!cardsResult.ok) {
      console.error('Failed to fetch cards database');
      console.error(await cardsResult.text());
      throw new Error('Failed to fetch cards database');
    }

    const json = await cardsResult.json();

    cards.push(...json.data);

    if (json.meta.pagination.page >= json.meta.pagination.pageCount || json.data.length === 0) {
      break;
    }

    page++;
  }

  writeFileSync(path.join(__dirname, './cards.json'), JSON.stringify(cards));



  return cards.map(cardRaw => ({
    id: cardRaw.id,
    name: cardRaw.attributes.title,
    subtitle: cardRaw.attributes.subtitle,
    setCode: cardRaw.attributes.expansion.data.attributes.code,
    lang: cardRaw.attributes.locale,
    text: cardRaw.attributes.text,
    power: cardRaw.attributes.power,
    hp: cardRaw.attributes.hp,
    cost: cardRaw.attributes.cost,
    type: cardRaw.attributes.type.data.attributes.value,
    traits: cardRaw.attributes.traits.data.map((trait: any) => trait.attributes.name),
    arenas: cardRaw.attributes.arenas.data.map((arena: any) => arena.attributes.name),
    rarity: cardRaw.attributes.rarity.data.attributes.englishName,
    imageUrl: cardRaw.attributes.artFront.data?.attributes.url,
    collectorNumber: cardRaw.attributes.cardNumber,
    token: cardRaw.attributes.type.data.attributes.value === 'Token',
  }))
}

importCardDatabase().then(() => {
  process.exit(0);
});