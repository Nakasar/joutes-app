"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button.tsx";
import type { QuickResult } from "../quickResults.ts";

/**
 * Feuille de saisie du résultat, en plein bas d'écran : une ligne par issue
 * possible, libellée « j'ai gagné » / « <adversaire> a gagné » plutôt qu'en
 * scores abstraits. Deux touches suffisent — ouvrir, choisir.
 */
export function ReportSheet({
  open,
  myPlayerId,
  opponentName,
  tableNumber,
  quickResults,
  matchPlayerIds,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  myPlayerId: string;
  opponentName: string;
  tableNumber?: number;
  quickResults: QuickResult[];
  matchPlayerIds: string[];
  busy: boolean;
  onClose: () => void;
  onPick: (result: QuickResult) => void;
}) {
  const t = useTranslations("Tournaments");
  if (!open) return null;

  const myIndex = matchPlayerIds.indexOf(myPlayerId);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label={t("common.cancel")}
        className="absolute inset-0 bg-black/45"
        onClick={onClose}
      />
      <div className="relative mx-auto w-full max-w-2xl rounded-t-3xl bg-background p-5 pb-7">
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-muted-foreground/30" />
        <p className="text-center text-lg font-bold">{t("playerReport.whoWon")}</p>
        <p className="mt-1 text-center text-[13px] text-muted-foreground">
          {tableNumber !== undefined
            ? t("playerReport.tableAndOpponent", { table: tableNumber, name: opponentName })
            : t("playerSheet.against", { name: opponentName })}
        </p>

        <div className="mt-4 flex flex-col gap-2">
          {quickResults.map((result) => {
            const iWon = result.winnerIndex === myIndex;
            const isDraw = result.winnerIndex === null;
            // Le score est toujours présenté du point de vue du joueur : son
            // total d'abord, pour qu'il n'ait pas à le retourner mentalement.
            const myScore = result.scores[myIndex] ?? 0;
            const theirScore = result.scores[myIndex === 0 ? 1 : 0] ?? 0;
            return (
              <Button
                key={result.key}
                variant="outline"
                className="h-auto justify-between px-4 py-4 text-base"
                disabled={busy}
                onClick={() => onPick(result)}
              >
                <span className="font-semibold">
                  {isDraw
                    ? t("gamesEditor.draw")
                    : iWon
                      ? t("playerReport.iWon")
                      : t("playerReport.opponentWon", { name: opponentName })}
                </span>
                {!isDraw && (
                  <span className="font-mono text-muted-foreground">
                    {myScore} – {theirScore}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        <Button variant="ghost" className="mt-3 w-full" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
