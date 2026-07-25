"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
  TournamentBracketSeeding,
  TournamentEliminationSeeding,
  TournamentPhase,
  TournamentPhaseType,
  TournamentResultMode,
  TournamentScoringMethod,
} from "@/lib/types/Tournament";

/**
 * Formulaire de configuration d'une phase, partagé entre l'ajout et l'édition
 * (édition réservée aux phases non démarrées). En édition, les champs
 * optionnels vidés (rondes prévues, top cut) sont envoyés à null pour être
 * retirés de la phase.
 */
export function PhaseForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial?: TournamentPhase;
  submitLabel: ReactNode;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>;
}) {
  const t = useTranslations("Tournaments");
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<TournamentPhaseType>(initial?.type ?? "swiss");
  const [bestOf, setBestOf] = useState(String(initial?.bestOf ?? 1));
  const [resultMode, setResultMode] = useState<TournamentResultMode>(
    initial?.resultMode ?? "selection"
  );
  const [scoringMethod, setScoringMethod] = useState<TournamentScoringMethod>(
    initial?.scoringMethod ?? "fixed"
  );
  const [win, setWin] = useState(String(initial?.fixedScoring.win ?? 3));
  const [loss, setLoss] = useState(String(initial?.fixedScoring.loss ?? 0));
  const [draw, setDraw] = useState(String(initial?.fixedScoring.draw ?? 1));
  const [rankOffsets, setRankOffsets] = useState(
    initial?.rankOffsets.join(",") ?? "3,1,-1,-3,-4,-5,-7"
  );
  const [seeding, setSeeding] = useState<TournamentEliminationSeeding>(
    initial?.eliminationSeeding ?? "standings"
  );
  const [bracketSeeding, setBracketSeeding] = useState<TournamentBracketSeeding>(
    initial?.bracketSeeding ?? "opposite"
  );
  const [plannedRounds, setPlannedRounds] = useState(
    initial?.plannedRounds ? String(initial.plannedRounds) : ""
  );
  const [topCut, setTopCut] = useState(initial?.topCut ? String(initial.topCut) : "");
  const [minPlayers, setMinPlayers] = useState(String(initial?.minPlayersPerMatch ?? 2));
  const [maxPlayers, setMaxPlayers] = useState(String(initial?.maxPlayersPerMatch ?? 2));

  const submit = () => {
    if (!name.trim()) return;
    const body: Record<string, unknown> = {
      name: name.trim(),
      type,
      resultMode,
      scoringMethod,
    };
    const parsedBestOf = Number.parseInt(bestOf, 10);
    body.bestOf = Number.isFinite(parsedBestOf) && parsedBestOf >= 1 ? parsedBestOf : 1;

    if (scoringMethod === "fixed") {
      body.fixedScoring = {
        win: Number.parseInt(win, 10) || 0,
        loss: Number.parseInt(loss, 10) || 0,
        draw: Number.parseInt(draw, 10) || 0,
      };
    } else {
      const offsets = rankOffsets
        .split(",")
        .map((s) => Number.parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n));
      if (offsets.length > 0) body.rankOffsets = offsets;
    }

    if (type === "elimination") {
      body.eliminationSeeding = seeding;
    }
    if (type === "bracket") {
      body.bracketSeeding = bracketSeeding;
    }

    // N'ajouter le champ que si la saisie donne un entier valide ; en édition,
    // null retire explicitement la valeur (schéma de mise à jour nullable).
    const parsedRounds = Number.parseInt(plannedRounds, 10);
    if (type === "swiss" && Number.isFinite(parsedRounds) && parsedRounds > 0) {
      body.plannedRounds = parsedRounds;
    } else if (isEdit) {
      body.plannedRounds = null;
    }
    const parsedTopCut = Number.parseInt(topCut, 10);
    if (type !== "freeform" && Number.isFinite(parsedTopCut) && parsedTopCut > 1) {
      body.topCut = parsedTopCut;
    } else if (isEdit) {
      body.topCut = null;
    }
    // Bornes de joueurs par match. Le bracket est forcé à 2-2.
    if (type === "bracket") {
      body.minPlayersPerMatch = 2;
      body.maxPlayersPerMatch = 2;
    } else {
      const parsedMin = Number.parseInt(minPlayers, 10);
      const parsedMax = Number.parseInt(maxPlayers, 10);
      body.minPlayersPerMatch = Number.isFinite(parsedMin) && parsedMin >= 2 ? parsedMin : 2;
      body.maxPlayersPerMatch =
        Number.isFinite(parsedMax) && parsedMax >= (body.minPlayersPerMatch as number)
          ? parsedMax
          : (body.minPlayersPerMatch as number);
    }
    void onSubmit(body);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phase-name">{t("organizerPhases.nameLabel")}</Label>
          <Input
            id="phase-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("organizerPhases.namePlaceholder")}
            maxLength={200}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("organizerPhases.typeLabel")}</Label>
          <Select value={type} onValueChange={(v) => setType(v as TournamentPhaseType)}>
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
            value={bestOf}
            onChange={(e) => setBestOf(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("organizerPhases.resultModeLabel")}</Label>
          <Select
            value={resultMode}
            onValueChange={(v) => setResultMode(v as TournamentResultMode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selection">{t("organizerPhases.resultSelection")}</SelectItem>
              <SelectItem value="points">{t("organizerPhases.resultPoints")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("organizerPhases.scoringMethodLabel")}</Label>
          <Select
            value={scoringMethod}
            onValueChange={(v) => setScoringMethod(v as TournamentScoringMethod)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed">{t("organizerPhases.scoringFixedOption")}</SelectItem>
              <SelectItem value="rank_offset">{t("organizerPhases.scoringRankOption")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {scoringMethod === "fixed" && (
          <div className="space-y-2 md:col-span-2">
            <Label>{t("organizerPhases.fixedPointsLabel")}</Label>
            <div className="flex items-center gap-2">
              <Input
                aria-label={t("organizerPhases.winPointsAria")}
                type="number"
                className="w-20"
                value={win}
                onChange={(e) => setWin(e.target.value)}
              />
              <Input
                aria-label={t("organizerPhases.lossPointsAria")}
                type="number"
                className="w-20"
                value={loss}
                onChange={(e) => setLoss(e.target.value)}
              />
              <Input
                aria-label={t("organizerPhases.drawPointsAria")}
                type="number"
                className="w-20"
                value={draw}
                onChange={(e) => setDraw(e.target.value)}
              />
            </div>
          </div>
        )}
        {scoringMethod === "rank_offset" && (
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="phase-offsets">{t("organizerPhases.offsetsLabel")}</Label>
            <Input
              id="phase-offsets"
              value={rankOffsets}
              onChange={(e) => setRankOffsets(e.target.value)}
              placeholder="3,1,-1,-3,-4,-5,-7"
            />
            <p className="text-xs text-muted-foreground">{t("organizerPhases.offsetsHint")}</p>
          </div>
        )}
        {type === "elimination" && (
          <div className="space-y-2">
            <Label>{t("organizerPhases.eliminationSeedingLabel")}</Label>
            <Select
              value={seeding}
              onValueChange={(v) => setSeeding(v as TournamentEliminationSeeding)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standings">{t("organizerPhases.seedingStandings")}</SelectItem>
                <SelectItem value="random">{t("organizerPhases.seedingRandom")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {type === "bracket" && (
          <div className="space-y-2">
            <Label>{t("organizerPhases.bracketSeedingLabel")}</Label>
            <Select
              value={bracketSeeding}
              onValueChange={(v) => setBracketSeeding(v as TournamentBracketSeeding)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="opposite">{t("organizerPhases.bracketOpposite")}</SelectItem>
                <SelectItem value="adjacent">{t("organizerPhases.bracketAdjacent")}</SelectItem>
                <SelectItem value="random">{t("organizerPhases.bracketRandom")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {type === "swiss" && (
          <div className="space-y-2">
            <Label htmlFor="phase-rounds">{t("organizerPhases.roundsLabel")}</Label>
            <Input
              id="phase-rounds"
              type="number"
              min={1}
              value={plannedRounds}
              onChange={(e) => setPlannedRounds(e.target.value)}
            />
          </div>
        )}
        {type !== "freeform" && (
          <div className="space-y-2">
            <Label htmlFor="phase-topcut">{t("organizerPhases.topCutLabel")}</Label>
            <Input
              id="phase-topcut"
              type="number"
              min={2}
              value={topCut}
              onChange={(e) => setTopCut(e.target.value)}
              placeholder={t("organizerPhases.topCutPlaceholder")}
            />
          </div>
        )}
      </div>

      {/* Bornes de joueurs par match (le bracket est toujours en duel). */}
      {type !== "bracket" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>{t("organizerPhases.playersPerMatchLabel")}</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setMinPlayers("2");
                setMaxPlayers("2");
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
              value={minPlayers}
              onChange={(e) => setMinPlayers(e.target.value)}
            />
            <span className="text-muted-foreground">{t("organizerPhases.rangeTo")}</span>
            <Input
              id="phase-max-players"
              aria-label={t("organizerPhases.maxPlayersAria")}
              type="number"
              min={2}
              max={16}
              className="w-24"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(e.target.value)}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("organizerPhases.playersPerMatchHint")}</p>
        </div>
      )}
      <Button onClick={submit} disabled={busy || !name.trim()}>
        {submitLabel}
      </Button>
    </div>
  );
}
