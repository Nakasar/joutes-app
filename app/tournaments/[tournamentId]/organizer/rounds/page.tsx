import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTournamentById, isTournamentOrganizer } from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { RoundHistoryBrowser } from "../../RoundHistoryBrowser";

export default async function OrganizerRoundsPage({
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

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="rounds">
        <RoundHistoryBrowser tournamentId={tournamentId} canManage />
      </OrganizerShell>
    </div>
  );
}
