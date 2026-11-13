import { DateTime } from "luxon";
import { Lock, Trophy } from "lucide-react";

import { Link } from "@/i18n/navigation.ts";

export { toDeckResultView, type DeckResultView } from "@/lib/decks/result-view.ts";
import type { DeckResultView } from "@/lib/decks/result-view.ts";

/**
 * L'encart « Résultats en tournoi » d'une fiche de deck : les résultats que
 * son auteur y a liés et que le lecteur peut voir, du plus récent au plus
 * ancien. Le cadenas signale à l'auteur ceux que seuls ses groupes voient.
 */
export function DeckTournamentResults({ results, showVisibility = false }: { results: DeckResultView[]; showVisibility?: boolean }) {
  if (results.length === 0) {
    return <p className="text-[13px] text-muted-foreground">Aucun résultat enregistré pour cette liste.</p>;
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {results.slice(0, 8).map((result) => (
        <li key={result.id} className="flex items-start gap-2.5">
          <span className="w-10 shrink-0 pt-px font-mono text-sm font-bold">
            {result.placement ? (result.placement === 1 ? "1er" : `${result.placement}e`) : "—"}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            {result.tournamentHref ? (
              <Link href={result.tournamentHref} className="truncate text-[13px] font-medium hover:underline">
                {result.name}
              </Link>
            ) : (
              <span className="truncate text-[13px] font-medium">{result.name}</span>
            )}
            <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              {[
                DateTime.fromISO(result.date).setLocale("fr").toLocaleString(DateTime.DATE_MED),
                result.playerCount ? `${result.playerCount} joueurs` : undefined,
                result.topCut ? `top ${result.topCut}` : undefined,
                result.record,
                result.deckVersion ? `v${result.deckVersion}` : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
              {showVisibility && result.visibility === "groups" && (
                <Lock className="size-3" aria-label="Visible de vos groupes de jeu seulement" />
              )}
            </span>
          </span>
          {result.placement === 1 && <Trophy className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />}
        </li>
      ))}
    </ul>
  );
}
