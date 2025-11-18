import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLairsOwnedByUser } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import EventForm from "../EventForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";

export default async function NewEventPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login?redirect=/events/new");
  }

  const [ownedLairs, games] = await Promise.all([
    getLairsOwnedByUser(session.user.id),
    getAllGames(),
  ]);

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Nouvel événement</h1>
          <p className="text-muted-foreground mt-2">
            Créez un événement pour rassembler des joueurs
          </p>
        </div>

        {ownedLairs.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Vous ne possédez aucun lieu. Votre événement sera privé et visible uniquement par vous et les participants que vous inviterez.
            </AlertDescription>
          </Alert>
        )}

        <EventForm ownedLairs={ownedLairs} games={games} />
      </div>
    </div>
  );
}
