import { ensureLiveCode, listAnnouncements, listMatchesByRound } from "@/lib/db/tournaments";
import { LiveSection } from "../LiveSection";
import { loadOrganizerContext } from "../organizerContext";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function OrganizerLivePage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
  const { tournamentId } = await params;
  const { currentRound } = await loadOrganizerContext(tournamentId);

  const [announcements, liveCode, matches] = await Promise.all([
    listAnnouncements(tournamentId),
    ensureLiveCode(tournamentId),
    currentRound ? listMatchesByRound(tournamentId, currentRound.id) : Promise.resolve([]),
  ]);

  return (
    <div className="p-6">
      <LiveSection
        tournamentId={tournamentId}
        liveCode={liveCode}
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
