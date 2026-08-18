"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { GameTypeKey } from "@/lib/constants/game-types";
import { useJoinQrCode } from "@/app/tournaments/useJoinQrCode";
import { FormatIcon, type TournamentFormatKey } from "./FormatIcon";

/** Jeu proposé par le tunnel. `type` décide des questions d'inscription. */
export type WizardGame = {
  id: string;
  name: string;
  type: GameTypeKey;
  icon?: string;
  // Réglages de phase imposés par l'usage du jeu (barème, appariement,
  // statistiques relevées), résolus côté serveur depuis le preset du jeu —
  // comme le fait déjà le formulaire de phase du portail organisateur.
  phaseDefaults?: Record<string, unknown>;
};

type StepKey = "name" | "game" | "format" | "structure" | "bestOf" | "form";

const STEP_ORDER: StepKey[] = ["name", "game", "format", "structure", "bestOf", "form"];

const FORMATS: TournamentFormatKey[] = ["swiss", "elimination", "mixed", "timer", "free"];

// Choix de structure proposés selon le format. « auto » laisse Joutes décider
// au démarrage, d'après le nombre d'inscrits.
const AUTO = "auto";
const ROUND_OPTIONS = ["3", "4", "5", AUTO];
const BRACKET_OPTIONS = ["8", "16", "32", AUTO];
const TOP_CUT_OPTIONS = ["4", "8", "16"];

const BEST_OF_OPTIONS = [1, 3];

// Types de jeu pour lesquels une liste (deck ou armée) a un sens à l'inscription.
const LIST_GAME_TYPES: GameTypeKey[] = ["TCG", "Miniatures"];

type CreatedTournament = { id: string; name: string; joinCode?: string };

/** Compare sans accents ni casse : « pokemon » doit trouver « Pokémon ». */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Étapes du parcours pour un format et un jeu donnés. Le format décide de la
 * question de structure et de celle du best-of ; le type du jeu, de la question
 * des listes à l'inscription.
 */
function stepsFor(format: TournamentFormatKey | null, game: WizardGame | null): StepKey[] {
  return STEP_ORDER.filter((step) => {
    switch (step) {
      case "structure":
        return format === "swiss" || format === "elimination" || format === "mixed";
      case "bestOf":
        // Une phase chronométrée ne compte pas de parties : le best-of n'a rien
        // à y régler.
        return format !== null && format !== "timer";
      case "form":
        return game !== null && LIST_GAME_TYPES.includes(game.type);
      default:
        return true;
    }
  });
}

function initialsOf(name: string): string {
  return name
    .split(/[\s:]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

/**
 * Tunnel de création d'un tournoi : une question par étape, chacune révélée
 * quand la précédente est répondue, et le tournoi n'est créé qu'à la fin. Il
 * couvre ce qu'un organisateur règle systématiquement (nom, jeu, structure,
 * format des parties, listes à l'inscription) ; tout le reste vit dans le
 * portail organisateur, où « Configuration avancée » mène directement.
 */
export function CreateTournamentWizard({
  games,
  league = null,
}: {
  games: WizardGame[];
  /** Ligue au nom de laquelle le tournoi est créé, si le tunnel vient de là. */
  league?: { id: string; name: string } | null;
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();

  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [gameId, setGameId] = useState<string | null>(null);
  const [customGame, setCustomGame] = useState("");
  const [format, setFormat] = useState<TournamentFormatKey | null>(null);
  // Nombre de rondes (suisses) ou taille du bracket (élimination) ; `AUTO`
  // laisse le choix ouvert jusqu'au démarrage de la phase.
  const [structure, setStructure] = useState<string | null>(null);
  const [topCut, setTopCut] = useState<string | null>(null);
  const [bestOf, setBestOf] = useState<number | null>(null);
  const [lists, setLists] = useState<boolean | null>(null);

  const [reached, setReached] = useState<StepKey[]>(["name"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTournament | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<Partial<Record<StepKey, HTMLDivElement | null>>>({});

  const game = useMemo(() => games.find((g) => g.id === gameId) ?? null, [games, gameId]);
  const gameLabel = game?.name ?? customGame.trim();

  const steps = useMemo(() => stepsFor(format, game), [format, game]);
  const lastStep = steps[steps.length - 1];
  const applies = useCallback((step: StepKey) => steps.includes(step), [steps]);

  const answered = useCallback(
    (step: StepKey): boolean => {
      switch (step) {
        case "name":
          return name.trim().length > 0;
        case "game":
          return gameId !== null || customGame.trim().length > 0;
        case "format":
          return format !== null;
        case "structure":
          // Le format mixte pose deux questions dans la même étape : sans top
          // cut, le bracket prendrait tout le monde, ce qui vide les rondes
          // suisses de leur rôle.
          return structure !== null && (format !== "mixed" || topCut !== null);
        case "bestOf":
          return bestOf !== null;
        case "form":
          return lists !== null;
      }
    },
    [name, gameId, customGame, format, structure, topCut, bestOf, lists]
  );

  const visible = (step: StepKey) => reached.includes(step) && applies(step);

  // Révèle l'étape qui suit celle qu'on vient de répondre, et l'amène sous les
  // yeux. Les étapes déjà répondues restent ouvertes derrière : revenir sur un
  // choix ne coûte rien.
  //
  // `answer` porte la réponse qui vient d'être donnée quand elle change la
  // suite du parcours (le format décide de l'étape de structure) : l'état React
  // n'est pas encore à jour au moment où l'étape suivante est désignée.
  const revealAfter = (step: StepKey, answer?: { format: TournamentFormatKey | null }) => {
    const nextSteps = answer ? stepsFor(answer.format, game) : steps;
    const next = nextSteps[nextSteps.indexOf(step) + 1];
    if (!next) return;
    setReached((current) => (current.includes(next) ? current : [...current, next]));
    // Le rendu de l'étape révélée doit avoir eu lieu avant de l'atteindre.
    requestAnimationFrame(() => {
      const target = stepRefs.current[next];
      const scroller = scrollerRef.current;
      if (target && scroller) {
        scroller.scrollTo({ top: target.offsetTop - 24, behavior: "smooth" });
      }
    });
  };

  const filteredGames = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return games;
    return games.filter((g) => normalize(g.name).includes(needle));
  }, [games, query]);

  const progress = useMemo(() => {
    const done = steps.filter(answered).length;
    return Math.round((done / steps.length) * 100);
  }, [steps, answered]);

  const currentStepLabel = useMemo(() => {
    const pending = steps.find((step) => !answered(step));
    return t(`wizard.steps.${pending ?? lastStep}`);
  }, [steps, answered, lastStep, t]);

  /**
   * Phases à créer pour le format choisi. Le tunnel ne pose que la question
   * structurante ; tous les autres réglages de phase gardent leur défaut, ou
   * celui du preset du jeu quand il en impose un.
   */
  const buildPhases = (): Record<string, unknown>[] => {
    if (!format) return [];
    const presetFields = game?.phaseDefaults ?? {};
    const bo = bestOf ?? 1;
    const rounds = structure && structure !== AUTO ? Number(structure) : undefined;
    const cut = topCut ? Number(topCut) : undefined;

    switch (format) {
      case "swiss":
        return [
          {
            name: t("wizard.phaseNames.swiss"),
            type: "swiss",
            bestOf: bo,
            ...(rounds !== undefined && { plannedRounds: rounds }),
            ...presetFields,
          },
        ];
      case "elimination":
        return [
          {
            name: t("wizard.phaseNames.elimination"),
            type: "bracket",
            bestOf: bo,
            ...(rounds !== undefined && { topCut: rounds }),
            ...presetFields,
          },
        ];
      case "mixed":
        return [
          {
            name: t("wizard.phaseNames.swiss"),
            type: "swiss",
            bestOf: bo,
            order: 0,
            ...(rounds !== undefined && { plannedRounds: rounds }),
            ...presetFields,
          },
          {
            name: t("wizard.phaseNames.topCut"),
            type: "bracket",
            bestOf: bo,
            order: 1,
            ...(cut !== undefined && { topCut: cut }),
            ...presetFields,
          },
        ];
      case "timer":
        // Ni best-of ni barème : le classement se fait au temps réalisé.
        return [{ name: t("wizard.phaseNames.timer"), type: "time-race" }];
      case "free":
        return [
          { name: t("wizard.phaseNames.free"), type: "freeform", bestOf: bo, ...presetFields },
        ];
    }
  };

  // `fallback` porte le message affiché quand l'API n'en donne pas : une fois
  // le tournoi créé, parler d'un échec de création serait mentir.
  const post = async (
    url: string,
    body: unknown,
    { method = "POST", fallback }: { method?: "POST" | "PUT"; fallback: string }
  ) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? fallback);
    }
    return res.json();
  };

  /**
   * Crée le tournoi, puis ses phases et son formulaire d'inscription. Une fois
   * le tournoi créé, l'échec d'une étape suivante n'est plus bloquant : il est
   * signalé, et l'organisateur retrouve son tournoi dans le portail où il peut
   * finir le réglage à la main. Rien ne serait gagné à le lui cacher, ni à
   * défaire un tournoi déjà créé.
   */
  const create = async ({ advanced }: { advanced: boolean }) => {
    if (!name.trim()) {
      setError(t("new.nameRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    let tournament: CreatedTournament;
    try {
      tournament = (await post(
        "/api/tournaments",
        {
          name: name.trim(),
          ...(gameId ? { gameId } : customGame.trim() ? { customGameName: customGame.trim() } : {}),
          ...(league ? { leagueId: league.id } : {}),
          settings: { allowSelfReporting: true, requireConfirmation: false, preRegistration: false },
        },
        { fallback: t("new.createError") }
      )) as CreatedTournament;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("new.createError"));
      setBusy(false);
      return;
    }

    let setupError: string | null = null;
    try {
      // Séquentiel : sans `order` explicite, chaque phase se range derrière la
      // précédente, ce qui suppose que la précédente est déjà écrite.
      for (const phase of buildPhases()) {
        await post(`/api/tournaments/${tournament.id}/phases`, phase, {
          fallback: t("wizard.setupError"),
        });
      }
      if (lists && game) {
        await post(
          `/api/tournaments/${tournament.id}/form`,
          {
            fields: [
              {
                type: "decklist",
                label:
                  game.type === "TCG"
                    ? t("wizard.form.deckFieldLabel")
                    : t("wizard.form.armyFieldLabel"),
                required: true,
              },
            ],
            playerEditable: true,
            lateSubmissions: false,
          },
          { method: "PUT", fallback: t("wizard.setupError") }
        );
      }
    } catch (err) {
      setupError = err instanceof Error ? err.message : t("wizard.setupError");
    }

    // Un échec de configuration retient le raccourci vers le portail : mieux
    // vaut le dire sur l'écran final, avec le tournoi sous la main, que de
    // laisser l'organisateur découvrir seul une phase manquante.
    if (advanced && !setupError) {
      router.push(`/tournaments/${tournament.id}/organizer`);
      return;
    }
    setError(setupError);
    setCreated(tournament);
    setBusy(false);
  };

  if (created) {
    return (
      <WizardFrame onClose={() => router.push("/tournaments")} progress={100} stepLabel={t("wizard.steps.done")}>
        <DoneStep tournament={created} error={error} summary={{ gameLabel, format, bestOf, lists }} />
      </WizardFrame>
    );
  }

  const finishOn = (step: StepKey) => step === lastStep && answered(step);

  return (
    <WizardFrame
      onClose={() => router.push("/tournaments")}
      progress={progress}
      stepLabel={currentStepLabel}
      onAdvanced={name.trim() ? () => create({ advanced: true }) : undefined}
      busy={busy}
      scrollerRef={scrollerRef}
    >
      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {league && (
        <div className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm">
          {t("leagueLink.wizardNotice", { league: league.name })}
        </div>
      )}

      <Step
        index={1}
        title={t("wizard.name.title")}
        description={t("wizard.name.description")}
        first
        ref={(node) => {
          stepRefs.current.name = node;
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim()) {
              e.preventDefault();
              revealAfter("name");
            }
          }}
          placeholder={t("new.namePlaceholder")}
          maxLength={200}
          autoFocus
          className="h-14 text-lg md:text-lg"
        />
        <div className="mt-5 flex flex-wrap items-center gap-3.5">
          <Button onClick={() => revealAfter("name")} disabled={!name.trim()}>
            {t("wizard.continue")}
            <ArrowRight className="size-4" />
          </Button>
          <span className="text-[13px] text-muted-foreground">{t("wizard.name.enterHint")}</span>
        </div>
      </Step>

      {visible("game") && (
        <Step
          index={2}
          title={t("wizard.game.title")}
          description={t("wizard.game.description")}
          ref={(node) => {
            stepRefs.current.game = node;
          }}
        >
          <div className="relative mb-4">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("wizard.game.searchPlaceholder")}
              className="pl-9"
            />
          </div>

          {filteredGames.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("wizard.game.noResult")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filteredGames.map((g) => (
                <ChoiceCard
                  key={g.id}
                  selected={gameId === g.id}
                  onClick={() => {
                    setGameId(g.id);
                    setCustomGame("");
                    setLists(null);
                    revealAfter("game");
                  }}
                  className="items-start gap-2.5 p-3"
                >
                  <div className="flex h-14 w-full items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {g.icon ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={g.icon} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="font-mono text-sm text-muted-foreground">
                        {initialsOf(g.name)}
                      </span>
                    )}
                  </div>
                  <span className="text-[13px] font-semibold leading-tight [text-wrap:pretty]">
                    {g.name}
                  </span>
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    {t(`wizard.gameTypes.${g.type}`)}
                  </span>
                </ChoiceCard>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              value={customGame}
              onChange={(e) => {
                setCustomGame(e.target.value);
                setGameId(null);
                setLists(null);
              }}
              placeholder={t("wizard.game.customPlaceholder")}
              maxLength={200}
              className="min-w-[240px] flex-1 border-dashed"
            />
            <Button
              onClick={() => revealAfter("game")}
              disabled={!gameId && !customGame.trim()}
              variant="outline"
            >
              {t("wizard.continue")}
            </Button>
          </div>
        </Step>
      )}

      {visible("format") && (
        <Step
          index={3}
          title={t("wizard.format.title")}
          description={t("wizard.format.description")}
          ref={(node) => {
            stepRefs.current.format = node;
          }}
        >
          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {FORMATS.map((key) => (
              <ChoiceCard
                key={key}
                selected={format === key}
                onClick={() => {
                  setFormat(key);
                  setStructure(null);
                  setTopCut(null);
                  if (key === "timer") setBestOf(null);
                  revealAfter("format", { format: key });
                }}
                className="gap-3 p-5"
              >
                <FormatIcon format={key} />
                <span className="text-[15px] font-semibold">{t(`wizard.formats.${key}.name`)}</span>
                <span className="text-[12.5px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                  {t(`wizard.formats.${key}.description`)}
                </span>
              </ChoiceCard>
            ))}
          </div>
          {finishOn("format") && <FinishButton onClick={() => create({ advanced: false })} busy={busy} label={t("wizard.finish")} creating={t("new.creating")} />}
        </Step>
      )}

      {visible("structure") && (
        <Step
          index={steps.indexOf("structure") + 1}
          title={format === "elimination" ? t("wizard.structure.bracketTitle") : t("wizard.structure.roundsTitle")}
          description={
            format === "elimination"
              ? t("wizard.structure.bracketDescription")
              : t("wizard.structure.roundsDescription")
          }
          ref={(node) => {
            stepRefs.current.structure = node;
          }}
        >
          <div className="flex flex-wrap gap-3.5">
            {(format === "elimination" ? BRACKET_OPTIONS : ROUND_OPTIONS).map((value) => (
              <ChoiceCard
                key={value}
                selected={structure === value}
                onClick={() => setStructure(value)}
                className="min-w-[120px] gap-1 px-5 py-4"
              >
                <span className="text-[22px] font-semibold leading-tight">
                  {value === AUTO ? t("wizard.structure.auto") : value}
                </span>
                <span className="text-xs text-muted-foreground">
                  {value === AUTO
                    ? t("wizard.structure.autoHint")
                    : format === "elimination"
                      ? t("wizard.structure.playersHint")
                      : t("wizard.structure.roundsHint")}
                </span>
              </ChoiceCard>
            ))}
          </div>

          {format === "mixed" && (
            <div className="mt-6">
              <p className="mb-2.5 text-[13px] font-medium">{t("wizard.structure.topCutLabel")}</p>
              <div className="flex flex-wrap gap-2.5">
                {TOP_CUT_OPTIONS.map((value) => (
                  <ChoiceCard
                    key={value}
                    selected={topCut === value}
                    onClick={() => setTopCut(value)}
                    className="min-w-[78px] items-center px-4 py-3"
                  >
                    <span className="text-[15px] font-semibold">
                      {t("wizard.structure.topCutOption", { count: Number(value) })}
                    </span>
                  </ChoiceCard>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6">
            <Button onClick={() => revealAfter("structure")} disabled={!answered("structure")}>
              {t("wizard.continue")}
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </Step>
      )}

      {visible("bestOf") && (
        <Step
          index={steps.indexOf("bestOf") + 1}
          title={t("wizard.bestOf.title")}
          description={t("wizard.bestOf.description")}
          ref={(node) => {
            stepRefs.current.bestOf = node;
          }}
        >
          <div className="grid max-w-xl gap-3.5 sm:grid-cols-2">
            {BEST_OF_OPTIONS.map((value) => (
              <ChoiceCard
                key={value}
                selected={bestOf === value}
                onClick={() => {
                  setBestOf(value);
                  revealAfter("bestOf");
                }}
                className="gap-2 p-5"
              >
                <span className="flex gap-1.5">
                  {Array.from({ length: value }, (_, i) => (
                    <span
                      key={i}
                      className={cn(
                        "h-2 w-5.5 rounded-full",
                        bestOf === value ? "bg-sky-500" : "bg-muted-foreground/25"
                      )}
                    />
                  ))}
                </span>
                <span className="text-base font-semibold">
                  {t("wizard.bestOf.optionName", { count: value })}
                </span>
                <span className="text-[12.5px] text-muted-foreground [text-wrap:pretty]">
                  {t(`wizard.bestOf.option${value}Description`)}
                </span>
              </ChoiceCard>
            ))}
          </div>
          {finishOn("bestOf") && <FinishButton onClick={() => create({ advanced: false })} busy={busy} label={t("wizard.finish")} creating={t("new.creating")} />}
        </Step>
      )}

      {visible("form") && game && (
        <Step
          index={steps.indexOf("form") + 1}
          title={t("wizard.form.title")}
          description={
            game.type === "TCG" ? t("wizard.form.hintTcg") : t("wizard.form.hintMiniatures")
          }
          ref={(node) => {
            stepRefs.current.form = node;
          }}
        >
          <div className="grid max-w-2xl gap-3.5 sm:grid-cols-2">
            <ChoiceCard selected={lists === true} onClick={() => setLists(true)} className="gap-2 p-5">
              <span className="text-[15px] font-semibold">
                {game.type === "TCG" ? t("wizard.form.deckOn") : t("wizard.form.armyOn")}
              </span>
              <span className="text-[12.5px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("wizard.form.listsOnDescription")}
              </span>
            </ChoiceCard>
            <ChoiceCard selected={lists === false} onClick={() => setLists(false)} className="gap-2 p-5">
              <span className="text-[15px] font-semibold">{t("wizard.form.listsOff")}</span>
              <span className="text-[12.5px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
                {t("wizard.form.listsOffDescription")}
              </span>
            </ChoiceCard>
          </div>
          {finishOn("form") && <FinishButton onClick={() => create({ advanced: false })} busy={busy} label={t("wizard.finish")} creating={t("new.creating")} />}
        </Step>
      )}
    </WizardFrame>
  );
}

/**
 * Cadre plein écran du tunnel : barre de progression, échappatoire vers la
 * configuration avancée, et zone défilante qui porte les étapes.
 */
function WizardFrame({
  children,
  onClose,
  onAdvanced,
  progress,
  stepLabel,
  busy = false,
  scrollerRef,
}: {
  children: React.ReactNode;
  onClose: () => void;
  onAdvanced?: () => void;
  progress: number;
  stepLabel: string;
  busy?: boolean;
  scrollerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const t = useTranslations("Tournaments");

  // Le tunnel occupe l'écran : ce qui défile derrière lui n'a plus à défiler.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("wizard.title")}
      className="fixed inset-0 z-50 flex flex-col bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3.5 sm:px-7">
        <div className="flex items-center gap-2.5 sm:min-w-[180px]">
          <span className="size-5.5 rounded-full bg-gradient-to-br from-sky-400 to-sky-700" />
          <span className="text-sm font-semibold tracking-tight">{t("wizard.title")}</span>
        </div>
        <div className="order-last flex w-full flex-col gap-1.5 sm:order-none sm:w-auto sm:flex-1">
          <div className="flex justify-between text-[11px] tracking-wide text-muted-foreground">
            <span>{stepLabel}</span>
            <span>{t("wizard.progress", { percent: progress })}</span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width] duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:min-w-[180px]">
          {onAdvanced && (
            <Button variant="outline" size="sm" onClick={onAdvanced} disabled={busy}>
              {t("wizard.advanced")}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("common.close")}>
            <X className="size-4" />
          </Button>
        </div>
      </header>

      {/* `relative` : les étapes mesurent leur position par rapport au
          conteneur qui défile ; sans cela elles la mesureraient depuis le
          cadre plein écran, en-tête comprise, et le défilement les couperait. */}
      <div ref={scrollerRef} className="relative flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl px-5 pb-56 sm:px-8">{children}</div>
      </div>
    </div>
  );
}

/** Une question du tunnel : son rang, son intitulé, et ce qu'elle propose. */
function Step({
  index,
  title,
  description,
  first = false,
  children,
  ref,
}: {
  index: number;
  title: string;
  description: string;
  first?: boolean;
  children: React.ReactNode;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const t = useTranslations("Tournaments");
  return (
    <div
      ref={ref}
      className={cn("scroll-mt-6 py-10", first ? "pt-12" : "border-t")}
    >
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
        {t("wizard.stepNumber", { number: index })}
      </p>
      <h2 className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-[28px]">{title}</h2>
      <p className="mb-6 mt-1.5 text-sm text-muted-foreground [text-wrap:pretty]">{description}</p>
      {children}
    </div>
  );
}

/** Carte de choix : le geste du tunnel, partout où une option se désigne. */
function ChoiceCard({
  selected,
  onClick,
  className,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex flex-col rounded-xl border bg-card text-left transition-colors",
        "hover:border-sky-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
        selected && "border-sky-500 bg-sky-500/10",
        className
      )}
    >
      {children}
    </button>
  );
}

function FinishButton({
  onClick,
  busy,
  label,
  creating,
}: {
  onClick: () => void;
  busy: boolean;
  label: string;
  creating: string;
}) {
  return (
    <div className="mt-6">
      <Button onClick={onClick} disabled={busy}>
        {busy ? creating : label}
        {!busy && <Check className="size-4" />}
      </Button>
    </div>
  );
}

/**
 * Dernier écran : ce qu'il faut pour remplir la salle (QR code et code de
 * participation), un rappel de ce qui a été choisi, et la porte du portail
 * organisateur pour tout le reste.
 */
function DoneStep({
  tournament,
  error,
  summary,
}: {
  tournament: CreatedTournament;
  error: string | null;
  summary: {
    gameLabel: string;
    format: TournamentFormatKey | null;
    bestOf: number | null;
    lists: boolean | null;
  };
}) {
  const t = useTranslations("Tournaments");
  const { joinUrl, qrCodeUrl } = useJoinQrCode(tournament.joinCode ?? "");
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    // Le lien n'existe qu'une fois monté côté client : rien à copier avant.
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copie indisponible (permissions) : le lien reste scannable.
    }
  };

  const rows = [
    { key: "game", value: summary.gameLabel || "—" },
    {
      key: "format",
      value: summary.format ? t(`wizard.formats.${summary.format}.name`) : "—",
    },
    {
      key: "bestOf",
      value: summary.bestOf ? t("wizard.bestOf.optionName", { count: summary.bestOf }) : "—",
    },
    {
      key: "lists",
      value: summary.lists ? t("wizard.done.listsAsked") : t("wizard.done.listsNotAsked"),
    },
  ];

  return (
    <div className="py-12">
      <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-sky-600 dark:text-sky-400">
        {t("wizard.done.eyebrow")}
      </p>
      <h2 className="mt-2.5 text-2xl font-semibold tracking-tight sm:text-[28px]">
        {t("wizard.done.title", { name: tournament.name })}
      </h2>
      <p className="mb-7 mt-1.5 text-sm text-muted-foreground [text-wrap:pretty]">
        {t("wizard.done.description")}
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {t("wizard.setupErrorHint", { error })}
        </div>
      )}

      <div className="flex flex-col gap-5 md:flex-row md:items-stretch">
        {qrCodeUrl && (
          <div className="self-start rounded-2xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeUrl} alt={t("organizerJoin.qrAlt")} width={200} height={200} />
          </div>
        )}

        <div className="flex flex-1 flex-col justify-between gap-6 rounded-2xl border bg-card p-5">
          <div>
            {tournament.joinCode && (
              <>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {t("wizard.done.joinCodeLabel")}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-lg border bg-muted px-4 py-2 font-mono text-xl tracking-[0.16em]">
                    {tournament.joinCode}
                  </span>
                  <Button variant="outline" size="sm" onClick={copy}>
                    {copied ? t("organizerJoin.copied") : t("organizerJoin.copyLink")}
                  </Button>
                </div>
              </>
            )}

            <dl className="mt-5 flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="flex justify-between gap-4 border-b py-2 text-[13px] last:border-b-0"
                >
                  <dt className="text-muted-foreground">{t(`wizard.done.summary.${row.key}`)}</dt>
                  <dd className="text-right font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button asChild className="flex-1">
              <Link href={`/tournaments/${tournament.id}/organizer`}>{t("wizard.done.open")}</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/tournaments">{t("wizard.done.backToList")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
