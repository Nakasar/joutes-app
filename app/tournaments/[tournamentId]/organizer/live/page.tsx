import { ensureJoinCode, listAnnouncements, listMatchesByRound } from "@/lib/db/tournaments";
import { LiveSection } from "../LiveSection";
import { loadOrganizerContext } from "../organizerContext";

export default async function OrganizerLivePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { currentRound } = await loadOrganizerContext(tournamentId);

  const [announcements, joinCode, matches] = await Promise.all([
    listAnnouncements(tournamentId),
    ensureJoinCode(tournamentId),
    currentRound ? listMatchesByRound(tournamentId, currentRound.id) : Promise.resolve([]),
  ]);

  return (
    <div className="p-6">
      <LiveSection
        tournamentId={tournamentId}
        joinCode={joinCode}
        roundNumber={currentRound?.number}
        reportedMatches={matches.filter((m) => m.status === "completed").length}
        totalMatches={matches.length}
        initialAnnouncements={announcements.map((a) => ({
          id: a.id,
          message: a.message,
          level: a.level,
          createdAt: a.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
