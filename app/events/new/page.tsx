import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLairsOwnedByUser } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { canManageTournament, getTournamentById } from "@/lib/db/tournaments";
import EventForm from "../EventForm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ tournamentId?: string }>;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const t = await getTranslations("EventCreate");

  const { tournamentId } = await searchParams;

  if (!session?.user) {
    const target = tournamentId ? `/events/new?tournamentId=${tournamentId}` : "/events/new";
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  const [ownedLairs, games] = await Promise.all([
    getLairsOwnedByUser(session.user.id),
    getAllGames(),
  ]);

  // Création amorcée depuis un tournoi : l'événement portera sa date et son
  // lieu, et le tournoi lui sera rattaché à l'enregistrement. On ne propose le
  // rattachement qu'à qui peut déjà gérer le tournoi — l'API le revérifie.
  const tournament = tournamentId ? await getTournamentById(tournamentId).catch(() => null) : null;
  const linkTournament =
    tournament && canManageTournament(tournament, session.user.id)
      ? { id: tournament.id, name: tournament.name }
      : null;

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{t("page.title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("page.description")}
          </p>
        </div>

        {ownedLairs.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("page.noOwnedLairs")}
            </AlertDescription>
          </Alert>
        )}

        <EventForm ownedLairs={ownedLairs} games={games} linkTournament={linkTournament} />
      </div>
    </div>
  );
}
