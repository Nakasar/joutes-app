import { readAllGames } from "@/lib/db/games-cached.ts";
import GamesExplorer from "./GamesExplorer.tsx";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jeux",
  description: "Explorez les jeux de cartes à collectionner et jeux de plateau disponibles sur Joutes : règles, cartes, rulings et communauté.",
  keywords: ["jeux de cartes à collectionner", "tcg", "jeux de plateau", "règles du jeu", "rulings", "riftbound", "lorcana", "altered"],
  openGraph: {
    url: `https://joutes.app/games`,
    siteName: 'Joutes',
    title: 'Jeux - Joutes',
    description: 'Explorez les jeux de cartes à collectionner et jeux de plateau disponibles sur Joutes.',
  },
};

/**
 * Le catalogue ne dépend ni de la session ni de l'URL : lu en cache, il prérend
 * entièrement. Le `await connection()` qui était ici débloquait le pilote Mongo
 * au prix du rendu à la requête — la mise en cache règle les deux.
 */
export default async function GamesPage() {
  const games = await readAllGames();

  return <GamesExplorer games={games} />;
}
