import db from "@/lib/mongodb";
import {ObjectId} from "mongodb";

/*
 Fetch SWU cards from API and import them into meilisearch and mongodb.
 */

type CardAPI = {
  id: string;
  setId: string;
  number: string;
  name: string;
  displayName: string;
  subtitle?: string;
  type: string;
  traits: string;
  text: string;
}

async function getCardsFromAPI(): Promise<CardAPI[]> {
  console.info('Importing cards database from API...');

  const cardsResult = await fetch('https://api.dotgg.gg/cgfw/getcards?game=starwars');

  if (!cardsResult.ok) {
    throw new Error('Failed to fetch cards database');
  }

  const cardsRaw = await cardsResult.json();

  return cardsRaw;
}

async function main() {
  const cardsRaw = await getCardsFromAPI();

  const cards = cardsRaw.map(card => {
    return {
      originalId: card.id,
      id: `${card.setId}${card.number}`,
      name: card.displayName,
      type: card.type,
      text: card.text,
      subtitle: card.text,
      title: card.name,
    };
  });

  for (const card of cards) {
    console.log(card.originalId, card.id);
    await db.collection('cards').updateOne({
      id: card.originalId,
      gameId: new ObjectId('68f108675fdfb9c53ba3387d'),
    }, {
      $set: { id: card.id },
    });
  }
}

main().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});