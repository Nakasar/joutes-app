import { getAllGames } from "@/lib/db/games";
import GamesExplorer from "./GamesExplorer";
import type { Metadata } from "next";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

export default async function GamesPage() {
  const games = await getAllGames();

  return <GamesExplorer games={games} />;
}

