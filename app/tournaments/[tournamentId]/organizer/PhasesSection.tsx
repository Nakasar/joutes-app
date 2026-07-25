"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  TournamentPhase,
  TournamentPhaseType,
  TournamentResultMode,
  TournamentScoringMethod,
  TournamentEliminationSeeding,
  TournamentBracketSeeding,
} from "@/lib/types/Tournament";
import { NextPhaseButton } from "./NextPhaseButton";

export function PhasesSection({
  tournamentId,
  initialPhases,
}: {
  tournamentId: string;
  initialPhases: TournamentPhase[];
}) {
  const t = useTranslations("Tournaments");
  const [phases, setPhases] = useState<TournamentPhase[]>(initialPhases);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [phaseName, setPhaseName] = useState("");
  const [phaseType, setPhaseType] = useState<TournamentPhaseType>("swiss");
  const [phaseBestOf, setPhaseBestOf] = useState("1");
  const [phaseResultMode, setPhaseResultMode] = useState<TournamentResultMode>("selection");
  const [phaseScoringMethod, setPhaseScoringMethod] = useState<TournamentScoringMethod>("fixed");
  const [phaseWin, setPhaseWin] = useState("3");
  const [phaseLoss, setPhaseLoss] = useState("0");
  const [phaseDraw, setPhaseDraw] = useState("1");
  const [phaseRankOffsets, setPhaseRankOffsets] = useState("3,1,-1,-3,-4,-5,-7");
  const [phaseSeeding, setPhaseSeeding] = useState<TournamentEliminationSeeding>("standings");
  const [phaseBracketSeeding, setPhaseBracketSeeding] =
    useState<TournamentBracketSeeding>("opposite");
  const [phaseRounds, setPhaseRounds] = useState("");
  const [phaseTopCut, setPhaseTopCut] = useState("");
  const [phaseMinPlayers, setPhaseMinPlayers] = useState("2");
  const [phaseMaxPlayers, setPhaseMaxPlayers] = useState("2");

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

  const addPhase = () =>
    run(async () => {
      if (!phaseName.trim()) return;
      const body: Record<string, unknown> = {
        name: phaseName.trim(),
        type: phaseType,
        resultMode: phaseResultMode,
        scoringMethod: phaseScoringMethod,
      };
      const parsedBestOf = Number.parseInt(phaseBestOf, 10);
      body.bestOf = Number.isFinite(parsedBestOf) && parsedBestOf >= 1 ? parsedBestOf : 1;

      if (phaseScoringMethod === "fixed") {
        body.fixedScoring = {
          win: Number.parseInt(phaseWin, 10) || 0,
          loss: Number.parseInt(phaseLoss, 10) || 0,
          draw: Number.parseInt(phaseDraw, 10) || 0,
        };
      } else {
        const offsets = phaseRankOffsets
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n));
        if (offsets.length > 0) body.rankOffsets = offsets;
      }

      if (phaseType === "elimination") {
        body.eliminationSeeding = phaseSeeding;
      }
      if (phaseType === "bracket") {
        body.bracketSeeding = phaseBracketSeeding;
      }

      // N'ajouter le champ que si la saisie donne un entier positif : un NaN
      // (champ vide, "e"…) serait sérialisé en null par JSON.stringify et
      // rejeté par la validation de l'API.
      const parsedRounds = Number.parseInt(phaseRounds, 10);
      if (phaseType === "swiss" && Number.isFinite(parsedRounds) && parsedRounds > 0) {
        body.plannedRounds = parsedRounds;
      }
      // Top cut à l'entrée de la phase (hors freeform).
      const parsedTopCut = Number.parseInt(phaseTopCut, 10);
      if (phaseType !== "freeform" && Number.isFinite(parsedTopCut) && parsedTopCut > 1) {
        body.topCut = parsedTopCut;
      }
      // Bornes de joueurs par match. Le bracket est forcé à 2-2.
      if (phaseType === "bracket") {
        body.minPlayersPerMatch = 2;
        body.maxPlayersPerMatch = 2;
      } else {
        const parsedMin = Number.parseInt(phaseMinPlayers, 10);
        const parsedMax = Number.parseInt(phaseMaxPlayers, 10);
        body.minPlayersPerMatch = Number.isFinite(parsedMin) && parsedMin >= 2 ? parsedMin : 2;
        body.maxPlayersPerMatch =
          Number.isFinite(parsedMax) && parsedMax >= (body.minPlayersPerMatch as number)
            ? parsedMax
            : (body.minPlayersPerMatch as number);
      }
      await api(`/api/tournaments/${tournamentId}/phases`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPhaseName("");
      setPhaseRounds("");
      setPhaseTopCut("");
      setPhaseMinPlayers("2");
      setPhaseMaxPlayers("2");
      setPhaseBestOf("1");
      await refreshPhases();
    });

  const deletePhase = (phase: TournamentPhase) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phase.id}`, { method: "DELETE" });
      await refreshPhases();
    });

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle>{t("organizerPhases.title")}</CardTitle>
          <NextPhaseButton tournamentId={tournamentId} />
        </CardHeader>
        <CardContent className="space-y-6">
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("organizerPhases.empty")}</p>
          ) : (
            <ul className="space-y-3">
              {phases.map((phase) => (
                <li key={phase.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <div className="font-medium">{phase.name}</div>
                    <div className="text-sm text-muted-foreground">
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
                        ? ` · ${t("organizerPhases.summary.roundsCount", {
                            count: phase.plannedRounds,
                          })}`
                        : ""}
                      {phase.topCut
                        ? ` · ${t("organizerPhases.summary.topN", { count: phase.topCut })}`
                        : ""}
                      {phase.type === "bracket"
                        ? ` · ${t(`organizerPhases.bracketSeeding.${phase.bracketSeeding}`)}`
                        : ""}
                      {phase.type !== "bracket" && (
                        <>
                          {" · "}
                          {phase.minPlayersPerMatch === phase.maxPlayersPerMatch
                            ? phase.minPlayersPerMatch === 2
                              ? t("organizerPhases.summary.duels")
                              : t("organizerPhases.summary.podsOf", {
                                  count: phase.minPlayersPerMatch,
                                })
                            : t("organizerPhases.summary.podsRange", {
                                min: phase.minPlayersPerMatch,
                                max: phase.maxPlayersPerMatch,
                              })}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{t(`common.phaseStatus.${phase.status}`)}</Badge>
                    {phase.status === "not-started" && (
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
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-4 border-t pt-6">
            <h3 className="font-medium">{t("organizerPhases.addPhase")}</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phase-name">{t("organizerPhases.nameLabel")}</Label>
                <Input
                  id="phase-name"
                  value={phaseName}
                  onChange={(e) => setPhaseName(e.target.value)}
                  placeholder={t("organizerPhases.namePlaceholder")}
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("organizerPhases.typeLabel")}</Label>
                <Select value={phaseType} onValueChange={(v) => setPhaseType(v as TournamentPhaseType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="swiss">{t("common.phaseType.swiss")}</SelectItem>
                    <SelectItem value="elimination">{t("common.phaseType.elimination")}</SelectItem>
                    <SelectItem value="bracket">{t("common.phaseType.bracket")}</SelectItem>
                    <SelectItem value="freeform">{t("common.phaseType.freeform")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phase-bestof">{t("organizerPhases.bestOfLabel")}</Label>
                <Input
                  id="phase-bestof"
                  type="number"
                  min={1}
                  max={9}
                  value={phaseBestOf}
                  onChange={(e) => setPhaseBestOf(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("organizerPhases.resultModeLabel")}</Label>
                <Select
                  value={phaseResultMode}
                  onValueChange={(v) => setPhaseResultMode(v as TournamentResultMode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="selection">
                      {t("organizerPhases.resultSelection")}
                    </SelectItem>
                    <SelectItem value="points">{t("organizerPhases.resultPoints")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("organizerPhases.scoringMethodLabel")}</Label>
                <Select
                  value={phaseScoringMethod}
                  onValueChange={(v) => setPhaseScoringMethod(v as TournamentScoringMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">{t("organizerPhases.scoringFixedOption")}</SelectItem>
                    <SelectItem value="rank_offset">
                      {t("organizerPhases.scoringRankOption")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {phaseScoringMethod === "fixed" && (
                <div className="space-y-2 md:col-span-2">
                  <Label>{t("organizerPhases.fixedPointsLabel")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={t("organizerPhases.winPointsAria")}
                      type="number"
                      className="w-20"
                      value={phaseWin}
                      onChange={(e) => setPhaseWin(e.target.value)}
                    />
                    <Input
                      aria-label={t("organizerPhases.lossPointsAria")}
                      type="number"
                      className="w-20"
                      value={phaseLoss}
                      onChange={(e) => setPhaseLoss(e.target.value)}
                    />
                    <Input
                      aria-label={t("organizerPhases.drawPointsAria")}
                      type="number"
                      className="w-20"
                      value={phaseDraw}
                      onChange={(e) => setPhaseDraw(e.target.value)}
                    />
                  </div>
                </div>
              )}
              {phaseScoringMethod === "rank_offset" && (
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="phase-offsets">{t("organizerPhases.offsetsLabel")}</Label>
                  <Input
                    id="phase-offsets"
                    value={phaseRankOffsets}
                    onChange={(e) => setPhaseRankOffsets(e.target.value)}
                    placeholder="3,1,-1,-3,-4,-5,-7"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("organizerPhases.offsetsHint")}
                  </p>
                </div>
              )}
              {phaseType === "elimination" && (
                <div className="space-y-2">
                  <Label>{t("organizerPhases.eliminationSeedingLabel")}</Label>
                  <Select
                    value={phaseSeeding}
                    onValueChange={(v) => setPhaseSeeding(v as TournamentEliminationSeeding)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standings">
                        {t("organizerPhases.seedingStandings")}
                      </SelectItem>
                      <SelectItem value="random">{t("organizerPhases.seedingRandom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {phaseType === "bracket" && (
                <div className="space-y-2">
                  <Label>{t("organizerPhases.bracketSeedingLabel")}</Label>
                  <Select
                    value={phaseBracketSeeding}
                    onValueChange={(v) => setPhaseBracketSeeding(v as TournamentBracketSeeding)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opposite">
                        {t("organizerPhases.bracketOpposite")}
                      </SelectItem>
                      <SelectItem value="adjacent">
                        {t("organizerPhases.bracketAdjacent")}
                      </SelectItem>
                      <SelectItem value="random">{t("organizerPhases.bracketRandom")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {phaseType === "swiss" && (
                <div className="space-y-2">
                  <Label htmlFor="phase-rounds">{t("organizerPhases.roundsLabel")}</Label>
                  <Input
                    id="phase-rounds"
                    type="number"
                    min={1}
                    value={phaseRounds}
                    onChange={(e) => setPhaseRounds(e.target.value)}
                  />
                </div>
              )}
              {phaseType !== "freeform" && (
                <div className="space-y-2">
                  <Label htmlFor="phase-topcut">{t("organizerPhases.topCutLabel")}</Label>
                  <Input
                    id="phase-topcut"
                    type="number"
                    min={2}
                    value={phaseTopCut}
                    onChange={(e) => setPhaseTopCut(e.target.value)}
                    placeholder={t("organizerPhases.topCutPlaceholder")}
                  />
                </div>
              )}
            </div>

            {/* Bornes de joueurs par match (le bracket est toujours en duel). */}
            {phaseType !== "bracket" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>{t("organizerPhases.playersPerMatchLabel")}</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPhaseMinPlayers("2");
                      setPhaseMaxPlayers("2");
                    }}
                  >
                    {t("organizerPhases.duelPreset")}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    id="phase-min-players"
                    aria-label={t("organizerPhases.minPlayersAria")}
                    type="number"
                    min={2}
                    max={16}
                    className="w-24"
                    value={phaseMinPlayers}
                    onChange={(e) => setPhaseMinPlayers(e.target.value)}
                  />
                  <span className="text-muted-foreground">{t("organizerPhases.rangeTo")}</span>
                  <Input
                    id="phase-max-players"
                    aria-label={t("organizerPhases.maxPlayersAria")}
                    type="number"
                    min={2}
                    max={16}
                    className="w-24"
                    value={phaseMaxPlayers}
                    onChange={(e) => setPhaseMaxPlayers(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("organizerPhases.playersPerMatchHint")}
                </p>
              </div>
            )}
            <Button onClick={addPhase} disabled={busy || !phaseName.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              {t("organizerPhases.submit")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
