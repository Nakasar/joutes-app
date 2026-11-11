"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createSimulationAction,
  loadSimulatorAction,
  type Simulator,
} from "@/app/[locale]/(app)/games/riftbound/play/simulate/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Link, useRouter } from "@/i18n/navigation";
import {
  expectedMargin,
  SECONDS_PER_GAME,
  SIMULATION_SIZES,
  SIMULATION_SOURCES,
  type SimulationSource,
} from "@/lib/engine/simulation";
import type { BotDeckChoice } from "@/lib/engine/tables";
import { BOT_LEVELS, type BotLevel } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

type OpponentKind = "fixed" | "pool";

/** Les choix du deck évalué et d'un adversaire fixe : un deck Joutes ou un deck automatique. */
type DeckRef = Exclude<BotDeckChoice, { kind: "random" }>;

/** Une durée lisible : « environ 25 s », « environ 3 min ». */
export function durationLabel(t: ReturnType<typeof useTranslations>, seconds: number): string {
  return seconds < 60
    ? t("sim.aboutSeconds", { count: Math.max(1, Math.round(seconds)) })
    : t("sim.aboutMinutes", { count: Math.round(seconds / 60) });
}

/** La page Simuler : choisir le deck, l'adversaire, le nombre de parties et le niveau. */
export function SimulatorSetup() {
  const t = useTranslations("Games.Play");
  const router = useRouter();
  const cards = useTableCards();
  const [simulator, setSimulator] = useState<Simulator | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [deck, setDeck] = useState<DeckRef | null>(null);
  const [kind, setKind] = useState<OpponentKind>("pool");
  const [opponent, setOpponent] = useState<DeckRef | null>(null);
  const [sources, setSources] = useState<SimulationSource[]>(["meta"]);
  const [byLegend, setByLegend] = useState(false);
  const [games, setGames] = useState<number>(50);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSimulatorAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setSimulator(result.simulator);
      else setFailed(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t(`sim.error.${failed}`)}</p>
        {failed === "UNAUTHENTICATED" && (
          <Button asChild>
            <Link href="/login">{t("lobby.signIn")}</Link>
          </Button>
        )}
      </div>
    );
  }
  if (!simulator) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  const poolSize = sources.reduce((sum, source) => sum + simulator.pools[source], 0);
  const ready = deck !== null && (kind === "fixed" ? opponent !== null : poolSize > 0);
  const margin = expectedMargin(games);

  const toggleSource = (source: SimulationSource, on: boolean) =>
    setSources((previous) =>
      on ? SIMULATION_SOURCES.filter((s) => s === source || previous.includes(s)) : previous.filter((s) => s !== source),
    );

  const start = async () => {
    if (!deck) return;
    setBusy(true);
    const result = await createSimulationAction({
      deck,
      opponent: kind === "fixed" ? { kind, deck: opponent } : { kind, sources, byLegend },
      level,
      games,
    });
    if (result.ok) {
      router.push(`/games/riftbound/play/simulate/result?id=${result.id}&start=1`);
      return;
    }
    setBusy(false);
    toast.error(t(`sim.error.${result.error}`));
  };

  const tile = (on: boolean) =>
    cn(
      "flex flex-col gap-1 rounded-lg border p-3 text-left transition hover:border-primary/60",
      on && "border-primary bg-primary/10",
    );
  const segment = (on: boolean) =>
    cn("min-h-9 px-3 text-sm transition", on ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold">{t("sim.title")}</h2>
          <p className="max-w-prose text-sm text-muted-foreground">{t("sim.intro")}</p>
        </div>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t("sim.deckTitle")}</h3>
          <DeckPicker
            id="sim-deck"
            srLabel={t("sim.deckTitle")}
            decks={simulator.decks}
            legends={simulator.legends}
            cards={cards}
            value={deck}
            onChange={(choice) => setDeck(choice.kind === "random" ? null : choice)}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t("sim.opponentTitle")}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["fixed", "pool"] as const).map((value) => (
              <button key={value} type="button" aria-pressed={kind === value} onClick={() => setKind(value)} className={tile(kind === value)}>
                <span className="font-medium">{t(`sim.kind.${value}`)}</span>
                <span className="text-xs text-muted-foreground">{t(`sim.kindHint.${value}`)}</span>
              </button>
            ))}
          </div>

          {kind === "fixed" ? (
            <DeckPicker
              id="sim-opponent"
              srLabel={t("sim.opponentTitle")}
              decks={simulator.decks}
              legends={simulator.legends}
              cards={cards}
              value={opponent}
              onChange={(choice) => setOpponent(choice.kind === "random" ? null : choice)}
            />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">{t("sim.poolIntro")}</p>
              <ul className="flex flex-col">
                {SIMULATION_SOURCES.map((source) => (
                  <li key={source}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-secondary">
                      <Checkbox
                        checked={sources.includes(source)}
                        onCheckedChange={(checked) => toggleSource(source, checked === true)}
                        disabled={simulator.pools[source] === 0}
                      />
                      <span className="flex min-w-0 flex-1 flex-col leading-tight">
                        <span className="font-medium">{t(`sim.source.${source}`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`sim.sourceHint.${source}`)}</span>
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {t("deck.count", { count: simulator.pools[source] })}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {sources.includes("meta") && (
                <label className="flex cursor-pointer items-start gap-3 p-2 pl-9 text-sm">
                  <Checkbox checked={!byLegend} onCheckedChange={(checked) => setByLegend(checked !== true)} className="mt-0.5" />
                  <span>{t("sim.weighted")}</span>
                </label>
              )}
              <p className="text-sm">{poolSize === 0 ? t("sim.poolEmpty") : t("sim.poolSummary", { count: poolSize })}</p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t("sim.gamesTitle")}</h3>
          <div className="flex flex-row flex-wrap gap-6">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground" id="sim-count">
                {t("sim.count")}
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-labelledby="sim-count">
                {SIMULATION_SIZES.map((value) => (
                  <button key={value} type="button" aria-pressed={games === value} onClick={() => setGames(value)} className={segment(games === value)}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground" id="sim-level">
                {t("sim.level")}
              </span>
              <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-labelledby="sim-level">
                {BOT_LEVELS.map((value) => (
                  <button key={value} type="button" aria-pressed={level === value} onClick={() => setLevel(value)} className={segment(level === value)}>
                    {t(`level.${value}`)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">{t("sim.precision")}</span>
              <span className="text-lg font-semibold">{t("sim.points", { count: margin })}</span>
              <span className="text-xs text-muted-foreground">
                {t("sim.precisionHint", { low: 55 - margin, high: 55 + margin })}
              </span>
            </div>
            <div className="flex flex-col rounded-lg border p-3">
              <span className="text-xs text-muted-foreground">{t("sim.duration")}</span>
              <span className="text-lg font-semibold">{durationLabel(t, SECONDS_PER_GAME[level] * games)}</span>
              <span className="text-xs text-muted-foreground">{t("sim.durationHint")}</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{t("sim.fairness")}</p>
          <div className="flex flex-row flex-wrap items-center gap-3">
            <Button disabled={!ready || busy} onClick={start}>
              {t("sim.start", { count: games })}
            </Button>
            <span className="text-xs text-muted-foreground">{t("sim.saved")}</span>
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
          <h3 className="font-semibold">{t("sim.historyTitle")}</h3>
          {simulator.history.length === 0 && <p className="text-sm text-muted-foreground">{t("sim.historyNone")}</p>}
          <ul className="-mx-2 flex flex-col">
            {simulator.history.map((run) => {
              const decided = run.wins + run.losses;
              const against =
                run.opponent.kind === "fixed"
                  ? t("sim.againstDeck", { name: run.opponentName ?? "?" })
                  : t("sim.againstPool", {
                      sources: run.opponent.sources.map((source) => t(`sim.sourceShort.${source}`)).join(", "),
                    });
              return (
                <li key={run.id}>
                  <Link
                    href={`/games/riftbound/play/simulate/result?id=${run.id}`}
                    className="flex items-center gap-3 rounded-lg p-2 transition hover:bg-secondary"
                  >
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="truncate font-medium">{run.deckName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {against} · {t("sim.gamesOf", { played: run.played, target: run.target })} ·{" "}
                        {t(`level.${run.level}`)}
                      </span>
                    </span>
                    <span className="font-semibold">{decided ? `${Math.round((run.wins / decided) * 100)} %` : "—"}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="flex flex-col gap-2 rounded-xl border bg-card p-5 text-sm text-muted-foreground">
          <h3 className="font-semibold text-foreground">{t("sim.aboutTitle")}</h3>
          <p>{t("sim.about1")}</p>
          <p>{t("sim.about2")}</p>
        </section>
      </aside>
    </div>
  );
}
