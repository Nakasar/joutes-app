import { getAllGames } from "@/lib/db/games";
import GamesExplorer from "./GamesExplorer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jeux - Joutes",
  description: "Explorez les jeux de cartes à collectionner et jeux de plateau.",
  openGraph: {
    url: `https://joutes.app/games`,
    siteName: 'Joutes - Explorez les jeux',
    title: 'Jeux - Joutes',
    description: 'Explorez les jeux de cartes à collectionner et jeux de plateau.',
    images: 'https://joutes.app/joutes-games.png',
  },
};

export default async function GamesPage() {
  const games = await getAllGames();

  return <GamesExplorer games={games} />;
}

