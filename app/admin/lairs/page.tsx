import { getLairs } from "./actions";
import { getGames } from "../games/actions";
import { LairForm } from "./LairForm";
import { LairList } from "./LairList";

export default async function AdminLairsPage() {
  const [lairs, games] = await Promise.all([getLairs(), getGames()]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestion des Lieux de Jeu
          </h1>
          <LairForm games={games} onSuccess={() => {}} />
        </div>

        <LairList lairs={lairs} games={games} />
      </div>
    </div>
  );
}
