import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getAllGames } from "@/lib/db/games";
import { getTournamentById, isTournamentOrganizer } from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { SettingsSection } from "../SettingsSection";

export default async function OrganizerSettingsPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const tournament = await getTournamentById(tournamentId);
  if (!tournament) notFound();
  if (!isTournamentOrganizer(tournament, session.user.id)) redirect("/tournaments");

  const games = (await getAllGames())
    .map((game) => ({ id: game.id, name: game.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="settings">
        <SettingsSection tournament={tournament} games={games} />
      </OrganizerShell>
    </div>
  );
}
