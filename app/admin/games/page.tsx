import { getGames } from "./actions";
import { GameForm } from "./GameForm";
import { GameList } from "./GameList";

export default async function AdminGamesPage() {
  const games = await getGames();

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestion des Jeux
          </h1>
          <GameForm onSuccess={() => {}} />
        </div>

        <GameList games={games} />
      </div>
    </div>
  );
}
