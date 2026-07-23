import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTournamentById, isTournamentOrganizer, listPhases } from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { PhasesSection } from "../PhasesSection";

export default async function OrganizerPhasesPage({
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

  const phases = await listPhases(tournamentId);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="phases">
        <PhasesSection tournamentId={tournamentId} initialPhases={phases} />
      </OrganizerShell>
    </div>
  );
}
