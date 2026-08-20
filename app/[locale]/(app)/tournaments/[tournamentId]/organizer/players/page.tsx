import { Suspense } from "react";
import { ensureJoinCode, listPenalties } from "@/lib/db/tournaments.ts";
import { PlayersSection } from "../PlayersSection.tsx";
import { loadOrganizerContext } from "../organizerContext.ts";

import { PlayersSkeleton } from "../OrganizerSkeletons.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerPlayersPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><PlayersSkeleton /></div>}>
      <OrganizerPlayersPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerPlayersPageSection({ params }: { params: Params }) {
  const { tournamentId } = await params;
  const { players } = await loadOrganizerContext(tournamentId);

  const [joinCode, penalties] = await Promise.all([
    ensureJoinCode(tournamentId),
    listPenalties(tournamentId),
  ]);

  // Nombre de sanctions par joueur : alimente le drapeau de la liste sans avoir
  // à ouvrir la fiche de chacun.
  const penaltyCounts: Record<string, number> = {};
  for (const penalty of penalties) {
    penaltyCounts[penalty.playerId] = (penaltyCounts[penalty.playerId] ?? 0) + 1;
  }

  return (
    <div className="p-6">
      <PlayersSection
        tournamentId={tournamentId}
        initialPlayers={players}
        joinCode={joinCode}
        penaltyCounts={penaltyCounts}
      />
    </div>
  );
}
