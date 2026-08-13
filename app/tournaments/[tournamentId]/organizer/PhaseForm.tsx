"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_INTERVAL_HOURS } from "@/lib/types/Tournament";
import type {
  TournamentBracketSeeding,
  TournamentDeadlineResolution,
  TournamentEliminationSeeding,
  TournamentPhase,
  TournamentPhasePacing,
  TournamentPhaseType,
  TournamentResultMode,
  TournamentScoringMethod,
  TournamentSwissPairing,
  TournamentTiebreaker,
} from "@/lib/types/Tournament";
import {
  type PhasePresetOption,
  availableTiebreakers,
  effectiveTiebreakers,
  officialTiebreakers,
  sameTiebreakers,
  tiebreakerLabel,
} from "./phaseTiebreakers";

export type { PhasePresetOption };

// Valeur sentinelle du Select de preset (SelectItem ne peut pas être vide).
const NO_PRESET = "none";

/**
 * Sérialise le pool de scénarios en texte : une ligne par scénario, au format
 * « Nom | consignes ». Un éditeur en champ libre reste le plus rapide pour
 * saisir trois missions d'affilée, et se relit d'un coup d'œil.
 */
function scenariosToText(phase?: TournamentPhase): string {
  return (phase?.scenarios ?? [])
    .map((s) => (s.description ? `${s.name} | ${s.description}` : s.name))
    .join("\n");
}

function scenariosFromText(text: string): { id: string; name: string; description?: string }[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.indexOf("|");
      const name = (separator === -1 ? line : line.slice(0, separator)).trim();
      const description = separator === -1 ? undefined : line.slice(separator + 1).trim() || undefined;
      // L'identifiant est dérivé du rang : les rondes déjà créées portent une
      // copie du scénario, elles ne sont donc pas affectées par une renumérotation.
      return { id: `s${index + 1}`, name, description };
    });
}

/**
 * Formulaire de configuration d'une phase, partagé entre l'ajout et l'édition
 * (édition réservée aux phases non démarrées). En édition, les champs
 * optionnels vidés (rondes prévues, top cut) sont envoyés à null pour être
 * retirés de la phase.
 */
export function PhaseForm({
  initial,
  presets,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial?: TournamentPhase;
  presets: PhasePresetOption[];
  submitLabel: ReactNode;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>) => void | Promise<void>;
}) {
  const t = useTranslations("Tournaments");
  const isEdit = !!initial;

  const [name, setName] = useState(initial?.name ?? "");
  // Une phase puzzle n'apparie personne et ne compte pas de parties : tout ce
  // qui décrit un affrontement (best-of, points, appariement, rythme des
  // rondes) disparaît du formulaire. Ne restent que le nom, le top cut d'entrée
  // et le pool de puzzles.
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
  const [swissPairing, setSwissPairing] = useState<TournamentSwissPairing>(
    initial?.swissPairing ?? "ranked"
  );
  const [pacing, setPacing] = useState<TournamentPhasePacing>(initial?.pacing ?? "live");
  // L'organisateur raisonne en jours d'intervalle, le domaine en heures.
  const [intervalDays, setIntervalDays] = useState(
    String(Math.max(1, Math.round((initial?.intervalHours ?? DEFAULT_INTERVAL_HOURS) / 24)))
  );
  const [deadlineResolution, setDeadlineResolution] = useState<TournamentDeadlineResolution>(
    initial?.deadlineResolution ?? "double-loss"
  );
  // Nouvelle phase : le preset par défaut du jeu est retenu d'emblée, avec
  // l'exigence de saisie qui va avec. En édition, on repart de la phase telle
  // qu'elle est enregistrée — un réglage déjà pris ne se réécrit pas tout seul.
  const defaultPreset = presets.find((preset) => preset.applyByDefault);
  const [statsPresetKey, setStatsPresetKey] = useState(
    isEdit ? (initial?.statsPresetKey ?? NO_PRESET) : (defaultPreset?.key ?? NO_PRESET)
  );
  const [requireMatchStats, setRequireMatchStats] = useState(
    isEdit ? (initial?.requireMatchStats ?? false) : (defaultPreset?.requireStats ?? false)
  );
  const [scenariosText, setScenariosText] = useState(scenariosToText(initial));

  const isPuzzle = type === "time-race";

  // Preset choisi, dont dépendent les départages disponibles.
  const selectedPreset = presets.find((preset) => preset.key === statsPresetKey);

  // Chaîne appliquée à la phase. En édition on repart de celle enregistrée, en
  // écartant ce qui ne se calcule plus (statistique d'un preset retiré depuis) ;
  // sans chaîne enregistrée, la phase suit les départages du jeu.
  const [tiebreakers, setTiebreakers] = useState<TournamentTiebreaker[]>(() =>
    effectiveTiebreakers(
      isEdit ? initial?.tiebreakers : undefined,
      isEdit ? presets.find((preset) => preset.key === initial?.statsPresetKey) : defaultPreset
    )
  );

  // Changer de preset rebascule l'exigence de saisie et les départages sur
  // l'usage du nouveau jeu : c'est ce que l'organisateur attend en choisissant
  // un format, et les deux restent modifiables juste en dessous.
  const pickPreset = (key: string) => {
    const preset = presets.find((option) => option.key === key);
    setStatsPresetKey(key);
    setRequireMatchStats(preset?.requireStats ?? false);
    setTiebreakers(officialTiebreakers(preset));
  };

  const labelOf = (key: TournamentTiebreaker): string =>
    tiebreakerLabel(key, selectedPreset, t);

  const tiebreakerDescription = (key: TournamentTiebreaker): string =>
    key.startsWith("stat:")
      ? t("organizerPhases.tiebreakerStatHint")
      : t(`organizerPhases.tiebreakerDescriptions.${key}`);

  // Déplace un critère d'un cran : l'ordre est toute la règle, il doit se
  // corriger sans avoir à tout retirer pour tout remettre.
  const moveTiebreaker = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= tiebreakers.length) return;
    const next = [...tiebreakers];
    [next[index], next[target]] = [next[target], next[index]];
    setTiebreakers(next);
  };

  const unusedTiebreakers = availableTiebreakers(selectedPreset).filter(
    (key) => !tiebreakers.includes(key)
  );
  const followsGame = sameTiebreakers(tiebreakers, officialTiebreakers(selectedPreset));

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
    if (type === "swiss") {
      body.swissPairing = swissPairing;
    }

    // Rythme et intervalle. `intervalHours` est toujours envoyé en asynchrone
    // (le schéma l'exige) et laissé de côté en direct, où il ne sert à rien.
    body.pacing = pacing;
    if (pacing === "asynchronous") {
      const parsedDays = Number.parseInt(intervalDays, 10);
      body.intervalHours = (Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 7) * 24;
      body.deadlineResolution = deadlineResolution;
    }

    // À la création, le champ est simplement omis quand aucun preset n'est
    // choisi ; en édition, null le retire explicitement de la phase.
    if (statsPresetKey !== NO_PRESET) {
      body.statsPresetKey = statsPresetKey;
      body.requireMatchStats = requireMatchStats;
    } else {
      // Sans preset il n'y a rien à exiger : le drapeau retombe, sinon une
      // phase reprenant un preset plus tard hériterait d'une exigence oubliée.
      body.requireMatchStats = false;
      if (isEdit) body.statsPresetKey = null;
    }

    // La chaîne n'est enregistrée que si elle s'écarte de celle du jeu : une
    // phase laissée telle quelle continue de suivre les règles officielles, y
    // compris si elles évoluent. En édition, null la rend explicitement au jeu.
    if (!followsGame) {
      body.tiebreakers = tiebreakers;
    } else if (isEdit) {
      body.tiebreakers = null;
    }

    const scenarios = scenariosFromText(scenariosText);
    if (scenarios.length > 0) {
      body.scenarios = scenarios;
    } else if (isEdit) {
      body.scenarios = null;
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
              <SelectItem value="time-race">{t("common.phaseType.time-race")}</SelectItem>
            </SelectContent>
          </Select>
          {isPuzzle && (
            <p className="text-xs text-muted-foreground">{t("organizerPhases.puzzleTypeHint")}</p>
          )}
        </div>
        {!isPuzzle && (
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
        )}
        {!isPuzzle && (
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
        )}
        {!isPuzzle && (
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
        )}
        {!isPuzzle && scoringMethod === "fixed" && (
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
        {!isPuzzle && scoringMethod === "rank_offset" && (
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
        {type === "swiss" && (
          <div className="space-y-2">
            <Label>{t("organizerPhases.swissPairingLabel")}</Label>
            <Select
              value={swissPairing}
              onValueChange={(v) => setSwissPairing(v as TournamentSwissPairing)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ranked">{t("organizerPhases.swissPairingRanked")}</SelectItem>
                <SelectItem value="random-in-bracket">
                  {t("organizerPhases.swissPairingRandom")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("organizerPhases.swissPairingHint")}</p>
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
      {type !== "bracket" && !isPuzzle && (
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

      {/* Rythme des rondes : sur place, ou par intervalles de plusieurs jours
          (ligues, où les joueurs planifient eux-mêmes leur partie). Un puzzle
          se résout en salle, chronomètre commun : il n'a que le rythme direct. */}
      {!isPuzzle && (
        <div className="space-y-4 border-t pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("organizerPhases.pacingLabel")}</Label>
              <Select value={pacing} onValueChange={(v) => setPacing(v as TournamentPhasePacing)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="live">{t("organizerPhases.pacingLive")}</SelectItem>
                  <SelectItem value="asynchronous">{t("organizerPhases.pacingAsync")}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t("organizerPhases.pacingHint")}</p>
            </div>
            {pacing === "asynchronous" && (
              <div className="space-y-2">
                <Label htmlFor="phase-interval">{t("organizerPhases.intervalLabel")}</Label>
                <Input
                  id="phase-interval"
                  type="number"
                  min={1}
                  max={365}
                  value={intervalDays}
                  onChange={(e) => setIntervalDays(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">{t("organizerPhases.intervalHint")}</p>
              </div>
            )}
            {pacing === "asynchronous" && (
              <div className="space-y-2 md:col-span-2">
                <Label>{t("organizerPhases.deadlineResolutionLabel")}</Label>
                <Select
                  value={deadlineResolution}
                  onValueChange={(v) => setDeadlineResolution(v as TournamentDeadlineResolution)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="double-loss">
                      {t("organizerPhases.deadlineDoubleLoss")}
                    </SelectItem>
                    <SelectItem value="manual">{t("organizerPhases.deadlineManual")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statistiques de match livrées par le jeu (départages officiels). Sans
          match, il n'y a rien à relever : le bloc disparaît sur un puzzle. */}
      {presets.length > 0 && !isPuzzle && (
        <div className="space-y-2 border-t pt-4">
          <Label>{t("organizerPhases.statsPresetLabel")}</Label>
          <Select value={statsPresetKey} onValueChange={pickPreset}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_PRESET}>{t("organizerPhases.statsPresetNone")}</SelectItem>
              {presets.map((preset) => (
                <SelectItem key={preset.key} value={preset.key}>
                  {t(`matchStats.presets.${preset.labelKey}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("organizerPhases.statsPresetHint")}</p>

          {/* Saisie exigée : le résultat n'est accepté qu'avec toutes les
              statistiques, pour chaque joueur. */}
          {statsPresetKey !== NO_PRESET && (
            <div className="flex items-start gap-3 rounded-md border p-3">
              <Checkbox
                id="phase-require-stats"
                checked={requireMatchStats}
                onCheckedChange={(checked) => setRequireMatchStats(checked === true)}
              />
              <div className="space-y-1 leading-none">
                <Label htmlFor="phase-require-stats">
                  {t("organizerPhases.requireStatsLabel")}
                </Label>
                <p className="text-xs text-muted-foreground">
                  {t("organizerPhases.requireStatsHint")}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Départage des égalités : la chaîne appliquée après les points de match,
          dans l'ordre. Une phase puzzle classe au chronomètre, sans point ni
          partie : aucun de ces critères n'y départage quoi que ce soit. */}
      {!isPuzzle && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{t("organizerPhases.tiebreakersLabel")}</Label>
            {!followsGame && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTiebreakers(officialTiebreakers(selectedPreset))}
              >
                {t("organizerPhases.tiebreakersReset")}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t("organizerPhases.tiebreakersHint")}</p>

          <ol className="space-y-2">
            {/* Les points de match tranchent toujours en premier : ils ne sont
                pas un départage, ils sont le classement. */}
            <li className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-3">
              <span className="text-xs font-medium text-muted-foreground">1</span>
              <div className="space-y-0.5">
                <div className="text-sm font-medium">
                  {t("organizerPhases.tiebreakerMatchPoints")}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("organizerPhases.tiebreakerMatchPointsHint")}
                </p>
              </div>
            </li>
            {tiebreakers.map((key, index) => (
              <li key={key} className="flex flex-wrap items-center gap-2 rounded-md border p-3">
                <span className="text-xs font-medium text-muted-foreground">{index + 2}</span>
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">{labelOf(key)}</div>
                  <p className="text-xs text-muted-foreground">{tiebreakerDescription(key)}</p>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => moveTiebreaker(index, -1)}
                    aria-label={t("organizerPhases.tiebreakerMoveUpAria", {
                      name: labelOf(key),
                    })}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={index === tiebreakers.length - 1}
                    onClick={() => moveTiebreaker(index, 1)}
                    aria-label={t("organizerPhases.tiebreakerMoveDownAria", {
                      name: labelOf(key),
                    })}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-800"
                    onClick={() => setTiebreakers(tiebreakers.filter((k) => k !== key))}
                    aria-label={t("organizerPhases.tiebreakerRemoveAria", {
                      name: labelOf(key),
                    })}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>

          {tiebreakers.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("organizerPhases.tiebreakersEmpty")}
            </p>
          )}

          {unusedTiebreakers.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {t("organizerPhases.tiebreakersAdd")}
              </span>
              {unusedTiebreakers.map((key) => (
                <Button
                  key={key}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTiebreakers([...tiebreakers, key])}
                >
                  <Plus className="mr-1 h-3 w-3" />
                  {labelOf(key)}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pool de scénarios, attribués aux rondes dans l'ordre. Une phase puzzle
          n'a qu'une ronde : la première ligne y décrit le puzzle à résoudre. */}
      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="phase-scenarios">
          {isPuzzle ? t("organizerPhases.puzzleLabel") : t("organizerPhases.scenariosLabel")}
        </Label>
        <Textarea
          id="phase-scenarios"
          rows={isPuzzle ? 2 : 4}
          value={scenariosText}
          onChange={(e) => setScenariosText(e.target.value)}
          placeholder={
            isPuzzle
              ? t("organizerPhases.puzzlePlaceholder")
              : t("organizerPhases.scenariosPlaceholder")
          }
        />
        <p className="text-xs text-muted-foreground">
          {isPuzzle ? t("organizerPhases.puzzleHint") : t("organizerPhases.scenariosHint")}
        </p>
      </div>

      <Button onClick={submit} disabled={busy || !name.trim()}>
        {submitLabel}
      </Button>
    </div>
  );
}
