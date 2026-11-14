"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Download } from "lucide-react";
import { useTranslations } from "next-intl";

import { DOUBT_COLOR, SEAT_COLORS } from "@/components/play/filmed/FilmedStage";
import { Button } from "@/components/ui/button";
import type { EngineView } from "@/lib/engine/types";
import { clock, reportOf, type Entry } from "@/lib/filmed/journal";

const ALERT = "#ff5a4a";

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-bold">{children}</span>
    </div>
  );
}

type FilmedReportProps = {
  entries: Entry[];
  view: EngineView;
  /** L'instant où le suivi s'est arrêté, en secondes. */
  end: number;
  /** Les secondes pendant lesquelles la table bougeait trop pour être lue. */
  moving: number;
  /** Les cartes des deux decks que le moteur ne couvre pas. */
  uncovered: number;
  /** Les cartes différentes que la lecture a reconnues. */
  cardsSeen: number;
  /** Les corrections saisies à la main (score, cartes face cachée). */
  manual: number;
  onBack: () => void;
  onExport: () => void;
  onReview: (entry: Entry) => void;
  onNew: () => void;
};

/** Le rapport d'arbitrage d'une partie filmée. */
export function FilmedReport({ entries, view, end, moving, uncovered, cardsSeen, manual, onBack, onExport, onReview, onNew }: FilmedReportProps) {
  const t = useTranslations("Games.Filmed");
  const report = reportOf(entries, end);
  const start = entries[0]?.time ?? 0;
  const span = Math.max(1, end - start);
  const at = (time: number) => `${Math.min(100, Math.max(0, ((time - start) / span) * 100))}%`;
  const deviations = entries.filter((entry) => entry.kind === "deviation");
  const marks = entries.filter((entry) => entry.kind === "deviation" || entry.kind === "question" || entry.kind === "score");

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-row flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          {t("report.back")}
        </Button>
        <h2 className="text-lg font-semibold">{t("report.title")}</h2>
        <span className="grow" />
        <Button type="button" variant="outline" size="sm" onClick={onExport}>
          <Download className="size-4" aria-hidden />
          {t("report.export")}
        </Button>
        <Button type="button" size="sm" onClick={onNew}>
          {t("report.new")}
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label={t("report.result")}>
          {view.players.map((player, index) => (
            <span key={player.seat}>
              {index > 0 && <span className="text-muted-foreground"> · </span>}
              <span style={{ color: SEAT_COLORS[player.seat] }}>
                {player.name} {view.points[player.seat] ?? 0}
              </span>
            </span>
          ))}
        </Tile>
        <Tile label={t("report.duration")}>
          {clock(report.duration)}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t("report.turns", { count: report.turns })}</span>
        </Tile>
        <Tile label={t("report.deviations")}>
          {report.deviations}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t("report.repaired", { repaired: report.repaired, table: report.tableRight })}
          </span>
        </Tile>
        <Tile label={t("report.explained")}>
          {report.explainedShare} %
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t("report.questions", { count: report.questions })}</span>
        </Tile>
        <Tile label={t("report.cards")}>
          {cardsSeen}
          <span className="ml-2 text-xs font-normal text-muted-foreground">{t("report.cardsHint")}</span>
        </Tile>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <strong className="text-sm">{t("report.game")}</strong>
          <span className="text-muted-foreground">{t("report.gameHint")}</span>
          <span className="grow" />
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: ALERT }} />
            {t("report.legend.deviation")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-primary" />
            {t("report.legend.question")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: DOUBT_COLOR }} />
            {t("report.legend.score")}
          </span>
        </div>
        <div className="relative pt-5 pb-5">
          <div className="flex h-6 flex-row gap-0.5">
            {report.segments.length === 0 && <div className="flex-1 rounded bg-secondary" />}
            {report.segments.map((segment) => (
              <div
                key={`${segment.turn}-${segment.seat}-${segment.start}`}
                title={t("journal.turn", { turn: segment.turn, name: view.players[segment.seat]?.name ?? "" })}
                className="rounded opacity-60"
                style={{ flex: `${Math.max(0.2, segment.end - segment.start)} 1 0`, background: SEAT_COLORS[segment.seat] }}
              />
            ))}
          </div>
          {marks.map((entry) =>
            entry.kind === "score" ? (
              <span
                key={entry.id}
                className="absolute top-1 size-2.5 -translate-x-1/2 rounded-sm"
                style={{ left: at(entry.time), background: DOUBT_COLOR }}
              />
            ) : (
              <button
                key={entry.id}
                type="button"
                aria-label={`${clock(entry.time)} ${entry.deviation?.title ?? t("report.legend.question")}`}
                className="absolute top-8 -translate-x-1/2 -translate-y-1/2 rounded-full ring-4 ring-card"
                style={{
                  left: at(entry.time),
                  width: entry.kind === "deviation" ? 16 : 10,
                  height: entry.kind === "deviation" ? 16 : 10,
                  background: entry.kind === "deviation" ? ALERT : "var(--primary)",
                }}
                onClick={() => onReview(entry)}
              />
            ),
          )}
          <span className="absolute bottom-0 left-0 font-mono text-[11px] text-muted-foreground">{clock(start)}</span>
          <span className="absolute right-0 bottom-0 font-mono text-[11px] text-muted-foreground">{clock(end)}</span>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
          <strong>{t("report.deviations")}</strong>
          {deviations.length === 0 && <p className="text-sm text-muted-foreground">{t("report.noDeviation")}</p>}
          {deviations.map((entry) => (
            <div key={entry.id} className="flex flex-row flex-wrap items-start gap-3 border-t pt-3 first:border-t-0">
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: ALERT }} />
              <div className="min-w-0 flex-1 text-[13px] leading-snug">
                <div>
                  <strong>{entry.deviation?.title}</strong>{" "}
                  <span className="text-muted-foreground">
                    · {t("report.at", { turn: entry.turn, time: clock(entry.time) })}
                  </span>
                </div>
                {entry.lines.map((line, index) => (
                  <div key={index}>{line}</div>
                ))}
                {entry.deviation?.reason && (
                  <div className="text-muted-foreground">
                    {entry.deviation.reason}
                    {entry.deviation.rule && ` (${t("alert.ruleNumber", { rule: entry.deviation.rule })})`}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {entry.resolution === "repaired" && entry.resolvedAt !== undefined
                  ? t("report.repairedIn", { seconds: Math.max(0, Math.round(entry.resolvedAt - entry.time)) })
                  : t(`journal.resolution.${entry.resolution ?? "open"}`)}
              </span>
              {entry.shot && (
                <Button type="button" variant="outline" size="sm" onClick={() => onReview(entry)}>
                  {t("report.review")}
                </Button>
              )}
            </div>
          ))}
        </section>

        <aside className="flex flex-col gap-3 rounded-2xl border bg-card p-4 text-[13px] leading-snug">
          <strong className="text-base">{t("report.unchecked")}</strong>
          <span>{t.rich("report.draws", { b: (chunks) => <strong>{chunks}</strong> })}</span>
          {uncovered > 0 && <span>{t.rich("report.uncovered", { count: uncovered, b: (chunks) => <strong>{chunks}</strong> })}</span>}
          {moving >= 1 && <span>{t.rich("report.moving", { time: clock(moving), b: (chunks) => <strong>{chunks}</strong> })}</span>}
          <span>{t.rich("report.manual", { count: manual, b: (chunks) => <strong>{chunks}</strong> })}</span>
          <span className="grow" />
          <span className="text-xs text-muted-foreground">{t("report.privacy")}</span>
        </aside>
      </div>
    </div>
  );
}
