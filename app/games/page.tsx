import { getAllGames } from "@/lib/db/games";
import GamesExplorer from "./GamesExplorer";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Jeux - Joutes",
  description: "Explorez notre collection de jeux de cartes à collectionner et jeux de plateau",
};

export default async function GamesPage() {
  const games = await getAllGames();

  return <GamesExplorer games={games} />;
}

