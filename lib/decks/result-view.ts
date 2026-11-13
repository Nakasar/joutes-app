import { formatRecord } from "@/lib/tournaments/results.ts";
import type { TournamentResult } from "@/lib/types/TournamentResult";

/** Ce que la fiche d'un deck montre d'un résultat : rien qui ne serve qu'à l'écrire. */
export type DeckResultView = Pick<
  TournamentResult,
  "id" | "source" | "name" | "date" | "placement" | "playerCount" | "topCut" | "deckVersion" | "visibility"
> & { record?: string; tournamentHref?: string };

export function toDeckResultView(result: TournamentResult, viewerId: string | null): DeckResultView {
  // La page d'un tournoi Joutes ne s'ouvre qu'à ses joueurs : le lien n'est que pour l'auteur du résultat.
  const joutesId =
    result.userId === viewerId && result.tournamentRef?.startsWith("joutes:")
      ? result.tournamentRef.slice("joutes:".length)
      : undefined;
  const record = formatRecord(result.record);

  return {
    id: result.id,
    source: result.source,
    name: result.name,
    date: result.date,
    visibility: result.visibility,
    ...(result.placement ? { placement: result.placement } : {}),
    ...(result.playerCount ? { playerCount: result.playerCount } : {}),
    ...(result.topCut ? { topCut: result.topCut } : {}),
    ...(result.deckVersion ? { deckVersion: result.deckVersion } : {}),
    ...(record ? { record } : {}),
    ...(joutesId ? { tournamentHref: `/tournaments/${joutesId}/player` } : {}),
  };
}

