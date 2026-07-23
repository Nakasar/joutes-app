import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getTournamentById,
  isTournamentOrganizer,
  listPhases,
  listRounds,
} from "@/lib/db/tournaments";
import { OrganizerShell } from "../OrganizerShell";
import { CreateRoundControl } from "./CreateRoundControl";
import { RoundsNav, type RoundsNavPhase } from "./RoundsNav";

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
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>Rondes</CardTitle>
            <CreateRoundControl
              tournamentId={tournamentId}
              phases={phases.map((p) => ({ id: p.id, name: p.name }))}
            />
          </CardHeader>
          <CardContent>
            <RoundsNav tournamentId={tournamentId} phases={navPhases} />
          </CardContent>
        </Card>
      </OrganizerShell>
    </div>
  );
}
