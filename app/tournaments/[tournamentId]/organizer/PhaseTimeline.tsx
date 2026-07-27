"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { TournamentPhase } from "@/lib/types/Tournament";

export type TimelineRound = {
  id: string;
  phaseId: string;
  number: number;
  status: "in-progress" | "completed";
  validated: boolean;
};

/**
 * Déroulé du tournoi en cartes d'étapes : ce qui est fait, ce qui tourne, ce qui
 * vient. La phase en cours est mise en avant et détaille ses rondes une à une,
 * pour situer d'un coup d'œil où en est la journée.
 */
export function PhaseTimeline({
  phases,
  rounds,
  activePlayerCount,
}: {
  phases: TournamentPhase[];
  rounds: TimelineRound[];
  activePlayerCount: number;
}) {
  const t = useTranslations("Tournaments");

  if (phases.length === 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-stretch gap-3">
      {phases.map((phase, index) => {
        const phaseRounds = rounds
          .filter((r) => r.phaseId === phase.id)
          .sort((a, b) => a.number - b.number);
        const running = phase.status === "in-progress";
        const done = phase.status === "completed";
        const currentRound = phaseRounds.find((r) => r.status === "in-progress");

        return (
          <div
            key={phase.id}
            className={cn(
              "min-w-60 flex-1 rounded-xl border p-4",
              running
                ? "border-transparent bg-foreground text-background"
                : done
                  ? "bg-card opacity-70"
                  : "border-dashed bg-card"
            )}
          >
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.06em]",
                running ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {t("organizerPhases.stepLabel", {
                index: index + 1,
                status: t(`common.phaseStatus.${phase.status}`),
              })}
            </p>
            <p className="mt-1.5 text-base font-semibold">{phase.name}</p>
            <p
              className={cn(
                "mt-1 text-[13px]",
                running ? "text-background/70" : "text-muted-foreground"
              )}
            >
              {t(`common.phaseType.${phase.type}`)}
              {" · "}
              {t("common.bestOfN", { count: phase.bestOf })}
              {phase.plannedRounds
                ? ` · ${t("organizerPhases.summary.roundsCount", { count: phase.plannedRounds })}`
                : ""}
              {phase.topCut ? ` · ${t("organizerPhases.summary.topN", { count: phase.topCut })}` : ""}
            </p>

            {/* Pastilles de rondes : le repère le plus direct de l'avancement
                d'une phase suisse. Les rondes prévues mais pas encore créées
                apparaissent en creux. */}
            {(phaseRounds.length > 0 || phase.plannedRounds) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {Array.from(
                  { length: Math.max(phaseRounds.length, phase.plannedRounds ?? 0) },
                  (_, i) => {
                    const round = phaseRounds[i];
                    const isCurrent = round && round.id === currentRound?.id;
                    return (
                      <span
                        key={round?.id ?? `planned-${i}`}
                        className={cn(
                          "rounded-md px-2 py-1 font-mono text-xs font-medium",
                          !round
                            ? running
                              ? "bg-background/15 text-background/50"
                              : "bg-muted text-muted-foreground"
                            : isCurrent
                              ? "bg-sky-500 text-sky-950"
                              : round.status === "completed"
                                ? "bg-emerald-500 text-emerald-950"
                                : "bg-muted text-muted-foreground"
                        )}
                      >
                        R{i + 1}
                      </span>
                    );
                  }
                )}
              </div>
            )}

            {phase.status === "not-started" && phase.topCut && (
              <p className="mt-2.5 text-[13px] text-muted-foreground">
                {t("organizerPhases.willFillWithTop", {
                  count: Math.min(phase.topCut, activePlayerCount),
                })}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
