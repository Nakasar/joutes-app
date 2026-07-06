import type { MetadataRoute } from 'next'
import db from "@/lib/mongodb";
import {BoosterCard} from "@/lib/types/booster";
import {Game} from "@/lib/types/Game";
import {getGameBySlugOrId} from "@/lib/db/games";
import {ObjectId} from "mongodb";

// Google's limit is 50,000 URLs per sitemap. Our limit is LIMIT.
const LIMIT = 10000;

export async function generateSitemaps() {
  const games = await db.collection<Game>('games').find({}, { projection: { slug: 1, features: 1 } }).toArray();

  const cardsForGames = await Promise.all(games.filter(g => g.features?.cards).map(async g => {
    return { count: await db.collection('cards').countDocuments({ gameId: g._id }), gameSlug: g.slug };
  }));

  const ids = cardsForGames.map(g => {
    return Array.from({ length: Math.ceil(g.count / LIMIT) }).map((_, i) => ({
      id: `${g.gameSlug}---${i}`,
    }));
  });

  return ids.flat();
}

export default async function sitemap(props: {
  id: Promise<string>;
}): Promise<MetadataRoute.Sitemap> {
  const id = await props.id

  const [slug, index] = id.split('---');

  const game = await getGameBySlugOrId(slug);
  if (!game) {
    return [];
  }

  const cards = await db.collection<Pick<BoosterCard, "id">>('cards').find({
    gameId: new ObjectId(game.id),
  }, { projection: { id: 1 } }).skip(Number(index) * LIMIT).limit(LIMIT).toArray();

  return cards.map((card) => ({
    url: `https://www.joutes.app/games/${slug}/cards/${card.id}`,
  }));
}
