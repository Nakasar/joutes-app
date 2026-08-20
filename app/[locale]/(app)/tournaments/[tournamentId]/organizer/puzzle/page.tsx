import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { listPuzzleResults } from "@/lib/db/tournaments.ts";
import { resolveDisplayPhase } from "@/lib/tournaments/current-round.ts";
import { loadOrganizerContext } from "../organizerContext.ts";
import { OrganizerPageHeader } from "../OrganizerPageHeader.tsx";
import { TableSectionSkeleton } from "../OrganizerSkeletons.tsx";
import { PuzzleBoard, type PuzzleBoardRow } from "./PuzzleBoard.tsx";

type Params = Promise<{ tournamentId: string }>;

export default function OrganizerPuzzlePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="p-6"><TableSectionSkeleton rows={10} columns={4} /></div>}>
      <OrganizerPuzzlePageSection params={params} />
    </Suspense>
  );
}

/**
 * Relevé des temps d'une phase de puzzle. La phase affichée est celle en cours
 * si c'est un puzzle ; sinon la dernière phase de puzzle configurée, pour que
 * l'organisation puisse encore corriger un temps une fois la phase close.
 */
async function OrganizerPuzzlePageSection({ params }: { params: Params }) {
  const { tournamentId } = await params;
  const t = await getTranslations("Tournaments");
  const { tournament, phases, players } = await loadOrganizerContext(tournamentId);

  const displayPhase = resolveDisplayPhase(phases, tournament.currentPhaseId);
  const phase =
    displayPhase?.type === "time-race"
      ? displayPhase
      : [...phases].reverse().find((candidate) => candidate.type === "time-race");

  if (!phase) {
    return (
      <div className="p-6">
        <OrganizerPageHeader title={t("puzzleBoard.pageTitle")} />
        <p className="text-sm text-muted-foreground">{t("puzzleBoard.noPhase")}</p>
      </div>
    );
  }

  const results = await listPuzzleResults(tournamentId, phase.id);
  const resultByPlayerId = new Map(results.map((result) => [result.playerId, result]));

  const rows: PuzzleBoardRow[] = players
    .filter((player) => player.status !== "dropped" || resultByPlayerId.has(player.id))
    .map((player) => ({
      playerId: player.id,
      displayName: player.displayName,
      discriminator: player.discriminator,
      dropped: player.status === "dropped",
      durationSeconds: resultByPlayerId.get(player.id)?.durationSeconds ?? null,
      selfReported: resultByPlayerId.get(player.id)?.selfReported ?? false,
    }));

  return (
    <div className="p-6">
      <PuzzleBoard
        tournamentId={tournamentId}
        phaseId={phase.id}
        phaseName={phase.name}
        puzzleName={phase.scenarios?.[0]?.name}
        rows={rows}
      />
    </div>
  );
}
