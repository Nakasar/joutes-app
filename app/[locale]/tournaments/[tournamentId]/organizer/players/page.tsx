import { ensureJoinCode, listPenalties } from "@/lib/db/tournaments";
import { PlayersSection } from "../PlayersSection";
import { loadOrganizerContext } from "../organizerContext";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function OrganizerPlayersPage({
  params,
}: {
  params: Promise<{ tournamentId: string }>;
}) {
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
