"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TournamentRoundStanding } from "@/lib/types/Tournament";

type Props = {
  tournamentId: string;
  roundId: string;
  // La ronde doit être terminée pour figer son classement.
  canValidate: boolean;
  initialStandings?: TournamentRoundStanding[];
  initialValidatedAt?: string;
};

export function RoundStandingsPanel({
  tournamentId,
  roundId,
  canValidate,
  initialStandings,
  initialValidatedAt,
}: Props) {
  const [standings, setStandings] = useState<TournamentRoundStanding[] | undefined>(initialStandings);
  const [validatedAt, setValidatedAt] = useState<string | undefined>(initialValidatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Classement à l&apos;issue de la ronde
        </h3>
        {standings ? (
          <Button variant="outline" size="sm" onClick={validate} disabled={busy || !canValidate}>
            <RotateCw className="h-4 w-4 mr-2" />
            Recalculer
          </Button>
        ) : (
          <Button size="sm" onClick={validate} disabled={busy || !canValidate}>
            Valider le classement
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!standings ? (
        <p className="text-sm text-muted-foreground">
          {canValidate
            ? "Classement non validé. Validez la ronde pour figer le classement."
            : "La ronde doit être terminée pour valider son classement."}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">
                    Joueur
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                    Pts
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                    V/N/D
                  </th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground uppercase">
                    Diff
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {standings.map((standing, index) => (
                  <tr key={standing.playerId}>
                    <td className="px-3 py-2">{index + 1}</td>
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
                {standings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                      Pas encore de classement
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {validatedAt && (
            <p className="text-xs text-muted-foreground">
              Validé le {DateTime.fromISO(validatedAt).setLocale("fr").toFormat("dd/MM/yyyy HH:mm")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
