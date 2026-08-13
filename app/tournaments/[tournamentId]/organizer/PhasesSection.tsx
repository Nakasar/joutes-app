"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TournamentPhase } from "@/lib/types/Tournament";
import { NextPhaseButton } from "./NextPhaseButton";
import { OrganizerPageHeader } from "./OrganizerPageHeader";
import { PhaseForm } from "./PhaseForm";
import {
  type PhasePresetOption,
  effectiveTiebreakers,
  tiebreakerLabel,
} from "./phaseTiebreakers";
import { PhaseTimeline, type TimelineRound } from "./PhaseTimeline";

// Valeur sentinelle du Select de phase en cours (SelectItem ne peut pas être vide).
const NO_PHASE = "none";

export function PhasesSection({
  tournamentId,
  initialPhases,
  initialCurrentPhaseId,
  presets,
  rounds,
  activePlayerCount,
}: {
  tournamentId: string;
  initialPhases: TournamentPhase[];
  initialCurrentPhaseId?: string;
  // Presets de format proposés par le jeu du tournoi. Vide = aucun.
  presets: PhasePresetOption[];
  rounds: TimelineRound[];
  activePlayerCount: number;
}) {
  const t = useTranslations("Tournaments");
  const [phases, setPhases] = useState<TournamentPhase[]>(initialPhases);
  const [currentPhaseId, setCurrentPhaseId] = useState(initialCurrentPhaseId ?? NO_PHASE);
  const [editPhase, setEditPhase] = useState<TournamentPhase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("common.error"));
      }
      return res.status === 204 ? null : res.json();
    },
    [t]
  );

  const refreshPhases = useCallback(async () => {
    setPhases(await api(`/api/tournaments/${tournamentId}/phases`));
  }, [api, tournamentId]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const addPhase = (body: Record<string, unknown>) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await refreshPhases();
    });

  const updatePhase = (phaseId: string, body: Record<string, unknown>) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phaseId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setEditPhase(null);
      await refreshPhases();
    });

  // Repasse une phase « en cours » à « non démarrée » (pour la reconfigurer
  // ou annuler un démarrage prématuré). Ses rondes éventuelles sont conservées.
  const resetPhaseStatus = (phase: TournamentPhase) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phase.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "not-started" }),
      });
      await refreshPhases();
    });

  const deletePhase = (phase: TournamentPhase) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phase.id}`, { method: "DELETE" });
      // Réconcilie le sélecteur de phase en cours si la phase supprimée était
      // la phase courante (le Select pointerait sinon sur une valeur disparue).
      if (phase.id === currentPhaseId) setCurrentPhaseId(NO_PHASE);
      await refreshPhases();
    });

  // Phase en cours du tournoi, modifiable manuellement (null = aucune).
  const changeCurrentPhase = (next: string) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ currentPhaseId: next === NO_PHASE ? null : next }),
      });
      setCurrentPhaseId(next);
    });

  // Résumé d'une phase dans la liste.
  const phaseSummary = (phase: TournamentPhase) => {
    // Preset de statistiques : l'organisateur doit voir depuis la liste qu'une
    // phase relève des scores, et si leur saisie conditionne les résultats.
    const preset = presets.find((option) => option.key === phase.statsPresetKey);
    // Une phase puzzle n'a ni best-of, ni points, ni appariement : son résumé
    // se limite à ce qui la décrit vraiment, le classement au chronomètre.
    if (phase.type === "time-race") {
      return (
        <>
          {t("common.phaseType.time-race")} · {t("organizerPhases.summary.puzzleTimed")}
          {phase.topCut ? ` · ${t("organizerPhases.summary.topN", { count: phase.topCut })}` : ""}
        </>
      );
    }
    return (
      <>
        {t(`common.phaseType.${phase.type}`)} · {t("common.bestOfN", { count: phase.bestOf })}
        {` · ${
          phase.resultMode === "points"
            ? t("organizerPhases.summary.resultPoints")
            : t("organizerPhases.summary.resultSelection")
        }`}
        {` · ${
          phase.scoringMethod === "rank_offset"
            ? t("organizerPhases.summary.scoringRank")
            : t("organizerPhases.summary.scoringFixed")
        }`}
        {phase.plannedRounds
          ? ` · ${t("organizerPhases.summary.roundsCount", { count: phase.plannedRounds })}`
          : ""}
        {phase.topCut ? ` · ${t("organizerPhases.summary.topN", { count: phase.topCut })}` : ""}
        {phase.type === "bracket"
          ? ` · ${t(`organizerPhases.bracketSeeding.${phase.bracketSeeding}`)}`
          : ""}
        {phase.type !== "bracket" && (
          <>
            {" · "}
            {phase.minPlayersPerMatch === phase.maxPlayersPerMatch
              ? phase.minPlayersPerMatch === 2
                ? t("organizerPhases.summary.duels")
                : t("organizerPhases.summary.podsOf", { count: phase.minPlayersPerMatch })
              : t("organizerPhases.summary.podsRange", {
                  min: phase.minPlayersPerMatch,
                  max: phase.maxPlayersPerMatch,
                })}
          </>
        )}
        {preset ? ` · ${t(`matchStats.presets.${preset.labelKey}`)}` : ""}
        {preset && phase.requireMatchStats
          ? ` (${t("organizerPhases.summary.statsRequired")})`
          : ""}
      </>
    );
  };

  // Départages appliqués par une phase, dans l'ordre, points de match compris :
  // l'organisateur doit pouvoir vérifier la règle sans ouvrir le formulaire.
  // Une phase puzzle classe au chronomètre et n'a rien à départager ainsi.
  const tiebreakSummary = (phase: TournamentPhase): string | null => {
    if (phase.type === "time-race") return null;
    const preset = presets.find((option) => option.key === phase.statsPresetKey);
    const chain = [
      t("organizerPhases.tiebreakerMatchPoints"),
      ...effectiveTiebreakers(phase.tiebreakers, preset).map((key) =>
        tiebreakerLabel(key, preset, t)
      ),
    ];
    return t("organizerPhases.tiebreakersSummary", { chain: chain.join(" › ") });
  };

  return (
    <div className="space-y-4">
      <OrganizerPageHeader
        title={t("organizerPhases.pageTitle")}
        description={t("organizerPhases.pageDescription")}
        actions={<NextPhaseButton tournamentId={tournamentId} />}
      />

      <PhaseTimeline phases={phases} rounds={rounds} activePlayerCount={activePlayerCount} />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("organizerPhases.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {phases.length > 0 && (
            <div className="space-y-2">
              <Label>{t("organizerPhases.currentPhaseLabel")}</Label>
              <Select value={currentPhaseId} onValueChange={changeCurrentPhase}>
                <SelectTrigger className="w-[280px]" disabled={busy}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PHASE}>{t("organizerPhases.currentPhaseNone")}</SelectItem>
                  {phases.map((phase) => (
                    <SelectItem key={phase.id} value={phase.id}>
                      {phase.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("organizerPhases.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {phases.map((phase) => {
                const tiebreaks = tiebreakSummary(phase);
                return (
                  <li key={phase.id} className="flex flex-wrap items-center justify-between rounded-lg border p-4 gap-2">
                    <div>
                      <div className="font-medium">{phase.name}</div>
                      <div className="text-sm text-muted-foreground">{phaseSummary(phase)}</div>
                      {tiebreaks && <div className="text-xs text-muted-foreground">{tiebreaks}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{t(`common.phaseStatus.${phase.status}`)}</Badge>
                      {phase.status === "in-progress" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resetPhaseStatus(phase)}
                          disabled={busy}
                          title={t("organizerPhases.resetStatusTitle")}
                          aria-label={t("organizerPhases.resetStatusAria", { name: phase.name })}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      {phase.status === "not-started" && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditPhase(phase)}
                            disabled={busy}
                            aria-label={t("organizerPhases.editPhaseAria", { name: phase.name })}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => deletePhase(phase)}
                            disabled={busy}
                            aria-label={t("organizerPhases.deletePhaseAria", { name: phase.name })}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">{t("organizerPhases.addPhase")}</h3>
            <PhaseForm
              presets={presets}
              busy={busy}
              submitLabel={
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("organizerPhases.submit")}
                </>
              }
              onSubmit={addPhase}
            />
          </div>
        </CardContent>
      </Card>

      {/* Édition d'une phase non démarrée. key force la réinitialisation du
          formulaire quand on change de phase. */}
      <Dialog open={!!editPhase} onOpenChange={(open) => !open && setEditPhase(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editPhase ? t("organizerPhases.editDialogTitle", { name: editPhase.name }) : ""}
            </DialogTitle>
          </DialogHeader>
          {editPhase && (
            <PhaseForm
              key={editPhase.id}
              initial={editPhase}
              presets={presets}
              busy={busy}
              submitLabel={t("organizerPhases.editSubmit")}
              onSubmit={(body) => updatePhase(editPhase.id, body)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
