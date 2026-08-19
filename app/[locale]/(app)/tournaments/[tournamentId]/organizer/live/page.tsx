import { Suspense } from "react";
import { ensureLiveCode, listAnnouncements, listMatchesByRound } from "@/lib/db/tournaments.ts";
import { LiveSection } from "../LiveSection.tsx";
import { loadOrganizerContext } from "../organizerContext.ts";

import { CardSectionSkeleton } from "../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerLivePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><CardSectionSkeleton cards={2} /></div>}>
      <OrganizerLivePageSection params={params} />
    </Suspense>
  );
}

async function OrganizerLivePageSection({ params }: { params: Params }) {
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
