import { getAllGames } from "@/lib/db/games";
import { GameForm } from "./GameForm";
import { GameList } from "./GameList";
import { requireAdmin } from "@/lib/middleware/admin";

export default async function AdminGamesPage() {
  await requireAdmin();

  const games = await getAllGames();

  return (
    <div className="bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestion des Jeux
          </h1>
          <GameForm />
        </div>

        <GameList games={games} />
      </div>
    </div>
  );
}
