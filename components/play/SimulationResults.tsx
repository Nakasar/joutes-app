"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  deleteSimulationAction,
  extendSimulationAction,
  getSimulationAction,
} from "@/app/[locale]/(app)/games/riftbound/play/simulate/actions";
import { durationLabel } from "@/components/play/SimulatorSetup";
import { useSimulationRunner } from "@/components/play/useSimulationRunner";
import { writeSoloSave } from "@/components/play/useSoloGame";
import { useTableCards } from "@/components/play/useTableCards";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { gameConfig, simulationStats, type SimulationDeck, type SimulationGame } from "@/lib/engine/simulation";
import { DOMAIN_HEX } from "@/lib/engine/told-text";
import { ENGINE_VERSION } from "@/lib/engine/version";
import type { DeckSimulation } from "@/lib/types/DeckSimulation";
import { cn } from "@/lib/utils";

/** Sous ce nombre de parties, le chiffre d'un adversaire est grisé : trop peu pour s'y fier. */
const FEW_GAMES = 10;
/** Parties montrées d'emblée dans la liste, puis à chaque « Voir plus ». */
const GAMES_PAGE = 50;
const MORE_GAMES = 50;

type Filter = "all" | "win" | "loss";

const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)} %`);

/** Les résultats d'une série, et la série elle-même tant qu'elle n'est pas finie. */
export function SimulationResults() {
  const t = useTranslations("Games.Play");
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const autostart = params.get("start") === "1";
  const cards = useTableCards();
  const [simulation, setSimulation] = useState<DeckSimulation | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [shown, setShown] = useState(GAMES_PAGE);

  useEffect(() => {
    let cancelled = false;
    void getSimulationAction(id).then((result) => {
      if (cancelled) return;
      if (result.ok) setSimulation(result.simulation);
      else setFailed(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const legendName = useCallback((code: string) => cards[code]?.name ?? code, [cards]);
  const deckName = useCallback(
    (deck: SimulationDeck) => (deck.source === "auto" ? t("sim.autoDeck", { legend: legendName(deck.legend) }) : deck.name),
    [t, legendName],
  );
  const names = useCallback(
    (opponent: SimulationDeck): [string, string] => (simulation ? [deckName(simulation.deck), deckName(opponent)] : ["", ""]),
    [simulation, deckName],
  );
  const runner = useSimulationRunner(simulation, names);

  // Une série tout juste créée démarre seule ; rouverte plus tard, elle attend « Reprendre ».
  const started = useRef(false);
  useEffect(() => {
    if (!simulation || !autostart || started.current) return;
    started.current = true;
    runner.start();
    router.replace(`/games/riftbound/play/simulate/result?id=${simulation.id}`);
  }, [simulation, autostart, runner, router]);

  const opponents = useMemo(
    () => Object.fromEntries((simulation?.pool ?? []).map((deck) => [deck.key, deck])),
    [simulation],
  );
  const stats = useMemo(() => simulationStats(runner.games, opponents), [runner.games, opponents]);

  if (failed) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center">
        <p className="text-muted-foreground">{t(`sim.error.${failed}`)}</p>
        <Button asChild>
          <Link href="/games/riftbound/play/simulate">{t("sim.back")}</Link>
        </Button>
      </div>
    );
  }
  if (!simulation) {
    return <p className="rounded-xl border bg-card p-8 text-center text-muted-foreground">{t("status.loading")}</p>;
  }

  const played = runner.games.length;
  const complete = played >= simulation.target;
  const remaining = Math.max(0, simulation.target - played);
  const against =
    simulation.opponent.kind === "fixed"
      ? deckName(simulation.pool[0])
      : simulation.opponent.sources.map((source) => t(`sim.sourceShort.${source}`)).join(", ");
  const decided = stats.wins + stats.losses;

  const extend = async (more: number) => {
    const result = await extendSimulationAction(simulation.id, more);
    if (!result.ok) {
      toast.error(t(`sim.error.${result.error}`));
      return;
    }
    // Seul le nombre visé change : les parties jouées restent celles du runner.
    setSimulation({ ...simulation, target: result.target });
  };

  const remove = async () => {
    if (!window.confirm(t("sim.deleteConfirm"))) return;
    runner.pause();
    const result = await deleteSimulationAction(simulation.id);
    if (result.ok) router.push("/games/riftbound/play/simulate");
    else toast.error(t(`sim.error.${result.error}`));
  };

  const watch = (game: SimulationGame) => {
    const opponent = opponents[game.opp];
    if (!opponent) return;
    writeSoloSave({
      seat: null,
      bots: [simulation.level, simulation.level],
      record: { config: gameConfig(game.n, simulation.deck, opponent, names(opponent)), seed: game.seed, actions: [] },
    });
    router.push("/games/riftbound/play/solo");
  };

  const listed = [...runner.games]
    .reverse()
    .filter((game) => filter === "all" || (filter === "win" ? game.win === true : game.win === false));

  const low = Math.round(stats.low * 100);
  const high = Math.round(stats.high * 100);
  const rate = stats.rate === null ? null : Math.round(stats.rate * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href="/games/riftbound/play/simulate" className="text-sm text-muted-foreground hover:text-foreground">
            ← {t("sim.back")}
          </Link>
          <h2 className="text-xl font-bold sm:text-2xl">
            {t("sim.resultTitle", { deck: deckName(simulation.deck), against })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("sim.resultHint", {
              target: simulation.target,
              level: t(`level.${simulation.level}`),
              pool: simulation.pool.length,
            })}
          </p>
        </div>
        <div className="flex flex-row flex-wrap gap-2">
          {!complete &&
            (runner.running ? (
              <Button variant="outline" onClick={runner.pause}>
                {t("sim.pause")}
              </Button>
            ) : (
              <Button onClick={runner.start}>{played === 0 ? t("sim.run") : t("sim.resume")}</Button>
            ))}
          <Button variant="outline" onClick={() => void extend(50)} disabled={simulation.target >= 1000}>
            {t("sim.more", { count: 50 })}
          </Button>
          <Button variant="outline" asChild>
            <Link href="/games/riftbound/play/simulate">{t("sim.again")}</Link>
          </Button>
          <Button variant="ghost" onClick={() => void remove()}>
            {t("sim.delete")}
          </Button>
        </div>
      </div>

      {simulation.engine !== ENGINE_VERSION && (
        <p className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3 text-sm">{t("sim.otherEngine")}</p>
      )}
      {runner.error && (
        <p className="rounded-lg border border-destructive/50 p-3 text-sm text-destructive">{t(`sim.error.${runner.error}`)}</p>
      )}

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-4">
        <div className="flex flex-row flex-wrap justify-between gap-2 text-sm">
          <span>{t("sim.progress", { played, target: simulation.target })}</span>
          <span className="text-muted-foreground">
            {complete
              ? t("sim.complete")
              : runner.running
                ? runner.pace !== null
                  ? durationLabel(t, runner.pace * remaining)
                  : t("sim.warming")
                : t("sim.paused")}
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded bg-secondary"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={simulation.target}
          aria-valuenow={played}
          aria-label={t("sim.progressLabel")}
        >
          <div className="h-full bg-primary transition-[width]" style={{ width: `${(played / simulation.target) * 100}%` }} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <span className="text-sm text-muted-foreground">{t("sim.winsOf", { deck: deckName(simulation.deck) })}</span>
          <div className="flex flex-row flex-wrap items-baseline gap-3">
            <span className="text-5xl font-bold leading-none">{rate === null ? "—" : `${rate} %`}</span>
            <span className="text-muted-foreground">{t("sim.record", { wins: stats.wins, losses: stats.losses })}</span>
          </div>
          {decided > 0 && (
            <>
              <div className="flex flex-col gap-1">
                <div
                  className="relative h-3.5 rounded-full bg-secondary"
                  role="img"
                  aria-label={t("sim.rangeLabel", { low, high })}
                >
                  <div className="absolute inset-y-0 rounded-full bg-primary/35" style={{ left: `${low}%`, width: `${high - low}%` }} />
                  <div className="absolute -inset-y-1 w-[3px] -translate-x-1/2 rounded bg-primary" style={{ left: `${rate}%` }} />
                  <div className="absolute -inset-y-1.5 left-1/2 w-px bg-foreground/50" />
                </div>
                <div className="flex justify-between font-mono text-[0.7rem] text-muted-foreground">
                  <span>0 %</span>
                  <span>50 %</span>
                  <span>100 %</span>
                </div>
              </div>
              <p className="text-sm">
                {t.rich("sim.range", { low, high, strong: (chunk) => <strong>{chunk}</strong> })}{" "}
                {low > 50 ? t("sim.favored") : high < 50 ? t("sim.unfavored") : t("sim.undecided")}
              </p>
            </>
          )}
        </section>

        <section className="grid grid-cols-2 gap-2">
          <Tile label={t("sim.first")} value={percent(stats.first.rate)} hint={t("sim.tally", { wins: stats.first.wins, games: stats.first.games })} />
          <Tile label={t("sim.second")} value={percent(stats.second.rate)} hint={t("sim.tally", { wins: stats.second.wins, games: stats.second.games })} />
          <Tile
            label={t("sim.turns")}
            value={stats.turns === null ? "—" : t("sim.turnsValue", { count: stats.turns.toFixed(1) })}
            hint={stats.winTurns === null ? "" : t("sim.winTurns", { count: stats.winTurns.toFixed(1) })}
          />
          <Tile
            label={t("sim.score")}
            value={stats.score ? `${stats.score[0].toFixed(1)} – ${stats.score[1].toFixed(1)}` : "—"}
            hint={t("sim.undecidedGames", { count: stats.undecided })}
          />
        </section>
      </div>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("sim.byOpponent")}</h3>
          <span className="text-xs text-muted-foreground">{t("sim.byOpponentHint", { count: FEW_GAMES })}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">{t("sim.opponentLegend")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("sim.gamesColumn")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("sim.wlColumn")}</th>
                <th className="w-2/5 px-2 py-1.5 font-medium">{t("sim.winsColumn")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.opponents.map((row) => {
                const card = cards[row.legend];
                return (
                  <tr key={row.legend} className="border-t">
                    <td className="px-2 py-2">
                      <span className="flex items-center gap-2">
                        <span className="flex gap-0.5" aria-hidden>
                          {(card?.domains ?? []).map((domain) => (
                            <span key={domain} className="size-2.5 rounded-full" style={{ background: DOMAIN_HEX[domain] ?? "#64748b" }} />
                          ))}
                        </span>
                        <span className="flex flex-col leading-tight">
                          <span className="font-medium">{legendName(row.legend)}</span>
                          <span className="text-xs text-muted-foreground">
                            {row.deckKey && opponents[row.deckKey]
                              ? deckName(opponents[row.deckKey])
                              : t("deck.count", { count: row.decks })}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right font-mono">{row.games}</td>
                    <td className="px-2 py-2 text-right font-mono">
                      {row.wins} – {row.losses}
                    </td>
                    <td className="px-2 py-2">
                      <span className={cn("flex items-center gap-2", row.games < FEW_GAMES && "opacity-50")}>
                        <span className="relative h-2 flex-1 overflow-hidden rounded bg-secondary">
                          <span className="absolute inset-y-0 left-0 rounded bg-primary" style={{ width: `${(row.rate ?? 0) * 100}%` }} />
                        </span>
                        <span className="w-11 text-right font-semibold">{percent(row.rate)}</span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <div className="flex flex-row flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">{t("sim.gamesList")}</h3>
          <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={t("sim.filter")}>
            {(["all", "win", "loss"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "min-h-9 px-3 text-xs transition",
                  filter === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`sim.filters.${value}`)}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-2 py-1.5 font-medium">{t("sim.number")}</th>
                <th className="px-2 py-1.5 font-medium">{t("sim.opponentColumn")}</th>
                <th className="px-2 py-1.5 font-medium">{t("sim.startsColumn")}</th>
                <th className="px-2 py-1.5 font-medium">{t("sim.resultColumn")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("sim.scoreColumn")}</th>
                <th className="px-2 py-1.5 text-right font-medium">{t("sim.turnsColumn")}</th>
                <th className="px-2 py-1.5">
                  <span className="sr-only">{t("sim.watch")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {listed.slice(0, shown).map((game) => {
                const opponent = opponents[game.opp];
                return (
                  <tr key={game.n} className="border-t">
                    <td className="px-2 py-1.5 font-mono text-muted-foreground">{game.n + 1}</td>
                    <td className="px-2 py-1.5">{opponent ? deckName(opponent) : "?"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{game.first ? t("sim.startsMe") : t("sim.startsThem")}</td>
                    <td className="px-2 py-1.5">
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold",
                          game.win === true && "bg-sky-400 text-slate-950",
                          game.win === false && "bg-orange-300 text-slate-950",
                          game.win === null && "bg-secondary",
                        )}
                      >
                        {game.win === true ? t("sim.win") : game.win === false ? t("sim.loss") : t("sim.draw")}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">
                      {game.score[0]} – {game.score[1]}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono">{game.turns}</td>
                    <td className="px-2 py-1.5 text-right">
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => watch(game)}>
                        {t("sim.watch")}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {listed.length > shown && (
          <Button variant="outline" size="sm" className="self-start" onClick={() => setShown((value) => value + MORE_GAMES)}>
            {t("sim.showMore")}
          </Button>
        )}
        <p className="text-xs text-muted-foreground">{t("sim.watchHint")}</p>
      </section>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{value}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
  );
}
