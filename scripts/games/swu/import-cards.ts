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
  /** Type de variante du site officiel (`Standard`, `Hyperspace`…). */
  variant: string | null;
  rarity: "string";
  cost: number;
  hp: number;
  power: number;
  token?: boolean;
};

/** Identifiant d'une carte : celui du document, tokens renumérotés à part. */
function cardId(setCode: string, collectorNumber: string | number, token?: boolean): string {
  return `${setCode}-${token ? `T${String(collectorNumber).padStart(2, '0')}` : collectorNumber}`;
}

/**
 * Ce qui désigne une carte d'une langue à l'autre.
 *
 * Ni son numéro seul — le site officiel renumérote les variantes, si bien que
 * « Je Suis Ton Père » est la 233 en standard et la 5 en hyperespace, numéro
 * que porte aussi une autre carte —, ni son identifiant, qui est propre à
 * chaque traduction. C'est le numéro **et** le type de variante qui la
 * retrouvent d'une langue à l'autre.
 */
function localeKey(setCode: string, collectorNumber: string | number, variant: string | null): string {
  return `${setCode}|${collectorNumber}|${variant ?? ''}`;
}

function variantTypeOf(cardRaw: any): string | null {
  return cardRaw.attributes.variantTypes?.data?.[0]?.attributes?.name ?? null;
}

export async function importCardDatabase() {
  console.info('Importing cards database...');

  const cardsIndex = meilisearch.index(indexes.swu.name);
  await cardsIndex.deleteAllDocuments();


  await db.collection('cards').deleteMany({
    gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
  });

  const cardsRaw = await getCardsListFromFile();
  const englishNames = await getEnglishNames();

  let cards = [];

  const batchSize = 50000;

  for (const cardRaw of cardsRaw) {
    const id = cardId(cardRaw.setCode, cardRaw.collectorNumber, cardRaw.token);
    const englishName = englishNames.get(localeKey(cardRaw.setCode, cardRaw.collectorNumber, cardRaw.variant));

    cards.push({
      id,
      image: cardRaw.imageUrl,
      lang: cardRaw.lang,
      setCode: cardRaw.setCode,
      collectorNumber: cardRaw.token ? `T${String(cardRaw.collectorNumber).padStart(2, '0')}` : String(cardRaw.collectorNumber),
      name: `${cardRaw.name}${cardRaw.subtitle ? `, ${cardRaw.subtitle}` : ''}`,
      // Le catalogue est importé en français ; le nom anglais est celui sous
      // lequel les places de marché vendent la carte (cf. docs/CARD_PRICES.md).
      ...(englishName ? { englishName } : {}),
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
      // Distingue les cartes importées de celles ajoutées à la main depuis
      // l'administration (`source: 'manual'`).
      source: 'import',
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

/**
 * Nom anglais de chaque carte, par extension, numéro et type de variante.
 *
 * Le catalogue est importé en français : les cartes n'ont alors que leur nom
 * français, alors que les places de marché — Cardmarket, cf.
 * docs/CARD_PRICES.md — nomment leurs produits en anglais. Le site officiel
 * rend la même liste dans les deux langues, carte pour carte : il suffit de la
 * relire en anglais et de rattacher chaque nom à sa carte.
 *
 * Un échec ici n'arrête pas l'import du catalogue : les cartes sont écrites
 * sans nom anglais, seuls les prix en pâtissent.
 */
async function getEnglishNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let expected = 0;

  try {
    for (let page = 1; ; page++) {
      console.info(`Fetching english card names page ${page}...`);
      const json = await fetchCardListPage('en', page);

      expected = json.meta.pagination.total ?? expected;

      for (const card of json.data) {
        const { title, subtitle, cardNumber, expansion } = card.attributes;
        const setCode = expansion?.data?.attributes?.code;

        if (!setCode || !title) {
          continue;
        }

        names.set(
          localeKey(setCode, cardNumber, variantTypeOf(card)),
          `${title}${subtitle ? `, ${subtitle}` : ''}`
        );
      }

      if (json.meta.pagination.page >= json.meta.pagination.pageCount || json.data.length === 0) {
        break;
      }
    }

    console.info(`${names.size} english card names.`);
  } catch (error) {
    // Ce qui a été récupéré reste utilisable : les cartes des pages manquantes
    // seront simplement importées sans nom anglais, et n'auront pas de prix.
    console.error(`Failed to fetch english card names (${names.size}/${expected} fetched):`, error);
  }

  return names;
}

/**
 * Une page de la liste des cartes du site officiel. Il répond ponctuellement
 * en 502 sur les quatre-vingt-dix pages d'un import : un échec isolé ne doit
 * pas priver tout le catalogue de ses noms anglais.
 */
async function fetchCardListPage(locale: string, page: number, attempt = 1): Promise<any> {
  const MAX_ATTEMPTS = 4;

  try {
    const response = await fetch(
      `https://admin.starwarsunlimited.com/api/card-list?locale=${locale}&pagination[page]=${page}&pagination[pageSize]=100`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} on page ${page}`);
    }

    return await response.json();
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    return fetchCardListPage(locale, page, attempt + 1);
  }
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
    variant: variantTypeOf(cardRaw),
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
    variant: variantTypeOf(cardRaw),
    token: cardRaw.attributes.type.data.attributes.value === 'Token',
  }))
}

importCardDatabase().then(() => {
  process.exit(0);
});