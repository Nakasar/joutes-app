import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  getTournamentById,
  canManageTournament,
  listPhases,
  listRounds,
} from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { RoundsHeader } from "./RoundsHeader";
import type { RoundsNavPhase } from "./RoundsNav";

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
  if (!canManageTournament(tournament, session.user.id)) redirect("/tournaments");

  const [phases, rounds] = await Promise.all([listPhases(tournamentId), listRounds(tournamentId)]);

  const navPhases: RoundsNavPhase[] = phases.map((phase) => ({
    phaseId: phase.id,
    phaseName: phase.name,
    rounds: rounds
      .filter((r) => r.phaseId === phase.id)
      .sort((a, b) => a.number - b.number)
      .map((r) => ({ id: r.id, number: r.number, validated: !!r.standingsValidatedAt })),
  }));

  return (
    <div className="mx-auto max-w-4xl p-8">
      <OrganizerShell tournamentId={tournamentId} tournamentName={tournament.name} active="rounds">
        <RoundsHeader tournamentId={tournamentId} phases={navPhases} />
      </OrganizerShell>
    </div>
  );
}
