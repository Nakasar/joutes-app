import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAllGames } from "@/lib/db/games";
import { getAllLairs } from "@/lib/db/lairs";
import { getUserById } from "@/lib/db/users";
import GameMatchForm from "./GameMatchForm";

export default async function NewGameMatchPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [games, lairs, user] = await Promise.all([
    getAllGames(),
    getAllLairs(),
    getUserById(session.user.id),
  ]);

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Nouvelle partie</h1>
        <p className="text-muted-foreground">
          Enregistrez une partie jouée avec vos amis
        </p>
      </div>

      <div className="bg-card border rounded-lg p-6">
        <GameMatchForm games={games} lairs={lairs} currentUser={user} />
      </div>
    </div>
  );
}
