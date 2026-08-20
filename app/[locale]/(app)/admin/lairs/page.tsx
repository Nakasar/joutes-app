import { LairForm } from "./LairForm.tsx";
import { LairList } from "./LairList.tsx";
import { requireAdmin } from "@/lib/middleware/admin.ts";
import { getAllLairs } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";

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
