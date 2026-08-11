"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TournamentMatch } from "@/lib/types/Tournament";
import { shortName, type QuickResult } from "../../../quickResults";

export type MatchCardPlayer = { id: string; name: string; discriminator?: string };

/**
 * Une table de la ronde, en carte : repère de table, joueurs et score, état, et
 * saisie du résultat dépliable en un geste. La carte est la vue par défaut de
 * la ronde car elle se lit debout, en salle, entre deux tables.
 */
export function MatchCard({
  match,
  players,
  quickResults,
  open,
  busy,
  onToggle,
  onQuickResult,
  onDetailedEntry,
  onExtend,
  onClearExtension,
}: {
  match: TournamentMatch;
  players: MatchCardPlayer[];
  quickResults: QuickResult[];
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onQuickResult: (result: QuickResult) => void;
  onDetailedEntry: () => void;
  onExtend: () => void;
  onClearExtension: () => void;
}) {
  const t = useTranslations("Tournaments");

  const isBye = match.players.length === 1;
  const disputed = match.status === "disputed";
  const done = match.status === "completed";
  const awaiting = match.status === "in-progress";
  const extensionMinutes = Math.round((match.extensionSeconds ?? 0) / 60);

  const statusLabel = disputed
    ? t("roundClient.cardStatus.disputed")
    : done
      ? t("roundClient.cardStatus.completed")
      : awaiting
        ? t("roundClient.cardStatus.awaitingConfirmation")
        : t("roundClient.cardStatus.pending");

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border bg-card",
        disputed && "border-destructive/40 ring-[3px] ring-destructive/10"
      )}
    >
      <div className="flex items-stretch">
        <div
          className={cn(
            "flex w-14 shrink-0 flex-col items-center justify-center py-3.5",
            disputed
              ? "bg-destructive text-white"
              : done
                ? "bg-muted text-muted-foreground"
                : "bg-foreground text-background"
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-[0.06em] opacity-70">
            {t("roundClient.tableShort")}
          </span>
          <span className="font-mono text-[22px] font-bold leading-tight">
            {match.tableNumber ?? "—"}
          </span>
        </div>

        <div className="min-w-0 flex-1 p-3">
          {match.players.map((p) => {
            const player = players.find((x) => x.id === p.playerId);
            const isWinner = match.winnerIds.includes(p.playerId);
            return (
              <div key={p.playerId} className="flex items-center justify-between gap-2 first:mb-1">
                <span
                  className={cn(
                    "truncate text-sm",
                    isWinner ? "font-bold" : "font-medium"
                  )}
                >
                  {player?.name ?? t("roundClient.unknownPlayer")}
                </span>
                <span
                  className={cn(
                    "font-mono text-[15px] font-semibold",
                    done ? "text-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {done ? p.score : "–"}
                </span>
              </div>
            );
          })}

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <span
              className={cn(
                "text-xs font-semibold",
                disputed
                  ? "text-destructive"
                  : done
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-muted-foreground"
              )}
            >
              {isBye ? t("roundClient.autoWin") : statusLabel}
            </span>
            {!isBye && (
              <div className="flex shrink-0 gap-1.5">
                <Button variant="outline" size="sm" onClick={onExtend} disabled={busy}>
                  {t("roundClient.extendShort")}
                </Button>
                <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
                  {disputed
                    ? t("roundClient.arbitrate")
                    : done
                      ? t("roundClient.correct")
                      : t("roundClient.enterResult")}
                </Button>
              </div>
            )}
          </div>

          {extensionMinutes > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-2.5 py-1.5 dark:border-sky-900 dark:bg-sky-950">
              <span className="text-xs font-semibold text-sky-800 dark:text-sky-300">
                {t("roundClient.extensionGranted", { minutes: extensionMinutes })}
              </span>
              <button
                type="button"
                onClick={onClearExtension}
                disabled={busy}
                className="text-xs text-sky-800 hover:underline disabled:opacity-50 dark:text-sky-300"
              >
                {t("roundClient.extensionRemove")}
              </button>
            </div>
          )}
        </div>
      </div>

      {open && !isBye && (
        <div className="border-t bg-muted/40 p-3">
          <p className="mb-2 text-xs text-muted-foreground">{t("roundClient.quickEntryTitle")}</p>
          {quickResults.length > 0 ? (
            <div className="grid grid-cols-2 gap-1.5">
              {quickResults.map((result) => {
                const winnerId =
                  result.winnerIndex === null ? null : match.players[result.winnerIndex]?.playerId;
                const winner = players.find((p) => p.id === winnerId);
                return (
                  <Button
                    key={result.key}
                    variant="outline"
                    className="h-auto justify-start px-3 py-2.5 text-left"
                    disabled={busy}
                    onClick={() => onQuickResult(result)}
                  >
                    <span className="truncate text-[13px] font-semibold">
                      {winner ? shortName(winner.name) : t("gamesEditor.draw")}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {result.scores[0]}–{result.scores[1]}
                    </span>
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="mb-2 text-sm text-muted-foreground">{t("roundClient.quickEntryUnavailable")}</p>
          )}
          <div className="mt-1.5 flex gap-1.5">
            <Button variant="outline" size="sm" className="flex-1" onClick={onDetailedEntry} disabled={busy}>
              {t("roundClient.detailedEntry")}
            </Button>
            <Button variant="ghost" size="sm" className="flex-1" onClick={onToggle} disabled={busy}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
