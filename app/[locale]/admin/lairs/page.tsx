import { LairForm } from "./LairForm";
import { LairList } from "./LairList";
import { requireAdmin } from "@/lib/middleware/admin";
import { getAllLairs } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function AdminLairsPage() {
  await requireAdmin();

  const [lairs, games] = await Promise.all([getAllLairs(), getAllGames()]);

  return (
    <div className="bg-muted/50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Gestion des Lieux de Jeu
          </h1>
          <LairForm games={games} />
        </div>

        <LairList lairs={lairs} games={games} />
      </div>
    </div>
  );
}
