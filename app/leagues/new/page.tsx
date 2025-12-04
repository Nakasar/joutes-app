import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { getAllGames } from "@/lib/db/games";
import { getAllLairs } from "@/lib/db/lairs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import LeagueForm from "./LeagueForm";

export const metadata: Metadata = {
  title: "Créer une ligue",
  description: "Créer une nouvelle ligue ou tournoi",
};

export default async function NewLeaguePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const [games, lairs] = await Promise.all([
    getAllGames(),
    getAllLairs(session.user.id),
  ]);

  // Filtrer les lairs pour ne garder que ceux dont l'utilisateur est owner
  const ownedLairs = lairs.filter((lair) =>
    lair.owners.includes(session.user.id)
  );

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/leagues">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">Nouvelle ligue</h1>
        </div>

        <LeagueForm games={games} lairs={ownedLairs} />
      </div>
    </div>
  );
}
