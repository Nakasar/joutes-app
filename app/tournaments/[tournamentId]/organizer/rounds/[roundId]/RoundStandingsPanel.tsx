"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePaginatedSearch } from "@/lib/use-paginated-search";
import type { TournamentRoundStanding } from "@/lib/types/Tournament";
import { TablePagination } from "../../../TablePagination";

export function RoundStandingsPanel({
  tournamentId,
  roundId,
  roundStatus,
  initialStandings,
  initialValidatedAt,
}: {
  tournamentId: string;
  roundId: string;
  roundStatus: string;
  initialStandings?: TournamentRoundStanding[];
  initialValidatedAt?: string;
}) {
  const [standings, setStandings] = useState<TournamentRoundStanding[] | undefined>(initialStandings);
  const [validatedAt, setValidatedAt] = useState<string | undefined>(initialValidatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ranked = (standings ?? []).map((standing, index) => ({ ...standing, rank: index + 1 }));
  const search = usePaginatedSearch(ranked, (s) => s.displayName, 25);
  const canValidate = roundStatus === "completed";

  const validate = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/rounds/${roundId}/standings`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la validation du classement");
      }
      const round = await res.json();
      setStandings(round.standings ?? []);
      setValidatedAt(round.standingsValidatedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de la validation du classement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Classement à l&apos;issue de la ronde</CardTitle>
        {standings ? (
          <Button variant="outline" size="sm" onClick={validate} disabled={busy || !canValidate}>
            <RotateCw className="mr-2 h-4 w-4" />
            Recalculer
          </Button>
        ) : (
          <Button size="sm" onClick={validate} disabled={busy || !canValidate}>
            Valider le classement
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}

        {!standings ? (
          <p className="text-sm text-muted-foreground">
            {canValidate
              ? "Classement non validé. Validez la ronde pour figer le classement."
              : "La ronde doit être terminée pour valider son classement."}
          </p>
        ) : (
          <>
            <Input
              value={search.query}
              onChange={(e) => search.setQuery(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="max-w-xs"
            />
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full divide-y divide-border text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                      Joueur
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                      Pts
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                      V/N/D
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium uppercase text-muted-foreground">
                      Diff
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {search.pageItems.map((standing) => (
                    <tr key={standing.playerId}>
                      <td className="px-3 py-2">{standing.rank}</td>
                      <td className="px-3 py-2 font-medium">
                        {standing.displayName}
                        {standing.playerStatus === "dropped" ? " (drop)" : ""}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{standing.matchPoints}</td>
                      <td className="px-3 py-2 text-right font-mono">
                        {standing.wins}/{standing.draws}/{standing.losses}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {standing.gamesDiff > 0 ? `+${standing.gamesDiff}` : standing.gamesDiff}
                      </td>
                    </tr>
                  ))}
                  {search.pageItems.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                        Aucun joueur ne correspond à la recherche.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={search.page}
              totalPages={search.totalPages}
              total={search.total}
              onPage={search.setPage}
            />
            {validatedAt && (
              <p className="text-xs text-muted-foreground">
                Validé le{" "}
                {DateTime.fromISO(validatedAt).toLocal().setLocale("fr").toFormat("dd/MM/yyyy HH:mm")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
