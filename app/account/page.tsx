import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import GamesManager from "./GamesManager";
import LairsManager from "./LairsManager";

export default async function AccountPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  // Récupérer les données complètes de l'utilisateur
  const user = await getUserById(session.user.id);
  
  if (!user) {
    redirect("/login");
  }

  // Récupérer tous les jeux disponibles
  const allGames = await getAllGames();

  // Récupérer les détails des jeux suivis par l'utilisateur
  const followedGames = await Promise.all(
    (user.games || []).map(async (gameId) => {
      const game = allGames.find(g => g.id === gameId);
      return game;
    })
  );
  const userGames = followedGames.filter(game => game !== undefined);

  // Récupérer les détails des lairs suivis par l'utilisateur
  const followedLairs = await Promise.all(
    (user.lairs || []).map(async (lairId) => {
      const lair = await getLairById(lairId);
      return lair;
    })
  );
  const userLairs = followedLairs.filter(lair => lair !== null);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Mon compte</h1>

        {/* Section Informations du profil */}
        <section className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Informations du profil</h2>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              {user.avatar && (
                <img 
                  src={user.avatar} 
                  alt="Avatar" 
                  className="w-16 h-16 rounded-full"
                />
              )}
              <div>
                <p className="text-sm text-gray-600">Nom d'utilisateur</p>
                <p className="text-lg font-semibold">{user.username || "Non défini"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Email</p>
              <p className="text-lg font-semibold">{user.email}</p>
              <p className="text-xs text-gray-500 mt-1">L'email ne peut pas être modifié</p>
            </div>
          </div>
        </section>

        {/* Section Jeux suivis */}
        <section className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Mes jeux suivis</h2>
          <GamesManager 
            userGames={userGames}
            allGames={allGames}
          />
        </section>

        {/* Section Lieux suivis */}
        <section className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold mb-4">Mes lieux suivis</h2>
          <LairsManager userLairs={userLairs} />
        </section>
      </div>
    </div>
  );
}
