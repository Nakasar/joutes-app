import { getAllGames } from "@/lib/db/games.ts";
import { GameForm } from "./GameForm.tsx";
import { GameList } from "./GameList.tsx";
import { AdminPage } from "../_components/AdminPage.tsx";
import { requireAdmin } from "@/lib/middleware/admin.ts";

export default async function AdminGamesPage() {
  await requireAdmin();

  const games = await getAllGames();

  return (
    <AdminPage
      title="Jeux"
      description="Le catalogue des jeux, leurs fonctionnalités et leur deck builder."
      actions={<GameForm />}
    >
      <GameList games={games} />
    </AdminPage>
  );
}
