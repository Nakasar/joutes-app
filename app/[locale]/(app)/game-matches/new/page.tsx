import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAllGames } from "@/lib/db/games.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { getUserById } from "@/lib/db/users.ts";
import GameMatchForm from "./GameMatchForm.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function NewGameMatchPage({
  searchParams,
}: {
  // `gameId` pré-sélectionne le jeu : la tuile « rapports de bataille » d'une
  // fiche de jeu amène ici, et redemander le jeu qu'on vient de quitter serait
  // une question de trop.
  searchParams: Promise<{ gameId?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { gameId } = await searchParams;

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
        <GameMatchForm
          games={games}
          lairs={lairs}
          currentUser={user}
          initialGameId={games.some((game) => game.id === gameId) ? gameId : undefined}
        />
      </div>
    </div>
  );
}
