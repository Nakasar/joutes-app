"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { TournamentMatch } from "@/lib/types/Tournament";
import { ActivityFeed } from "../../ActivityFeed";

/**
 * Rail « à traiter » de la ronde : ce qui bloque la clôture (litiges, tables
 * sans résultat), les prolongations en cours, puis le fil d'activité. Rassemble
 * au même endroit tout ce qu'un arbitre doit surveiller sans parcourir la
 * grille des tables.
 */
export function RoundSidePanel({
  tournamentId,
  matches,
  busy,
  onShowDisputes,
  onShowPending,
  onClearExtension,
}: {
  tournamentId: string;
  matches: TournamentMatch[];
  busy: boolean;
  onShowDisputes: () => void;
  onShowPending: () => void;
  onClearExtension: (match: TournamentMatch) => void;
}) {
  const t = useTranslations("Tournaments");

  const disputed = matches.filter((m) => m.status === "disputed");
  const pending = matches.filter((m) => m.status === "pending");
  const extended = matches.filter((m) => (m.extensionSeconds ?? 0) > 0);

  const tableLabel = (match: TournamentMatch) => match.tableNumber ?? "—";
  const pendingPreview = pending
    .slice(0, 6)
    .map(tableLabel)
    .join(", ");

  return (
    <aside
      data-print-hidden
      className="w-full shrink-0 space-y-5 border-t bg-card p-5 xl:w-[300px] xl:border-l xl:border-t-0"
    >
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("roundClient.toHandle")}
        </p>

        {disputed.length > 0 && (
          <div className="mb-2.5 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-[13px] font-bold text-destructive">
              {t("roundClient.disputesToArbitrate", { count: disputed.length })}
            </p>
            <p className="mt-1 text-[13px] leading-snug text-destructive/90">
              {t("roundClient.disputeHint", { table: tableLabel(disputed[0]) })}
            </p>
            <Button variant="destructive" size="sm" className="mt-2.5" onClick={onShowDisputes}>
              {t("roundClient.arbitrate")}
            </Button>
          </div>
        )}

        <div className="rounded-xl border p-3">
          <p className="text-[13px] font-semibold">
            {t("roundClient.tablesWithoutResult", { count: pending.length })}
          </p>
          {pending.length > 0 && (
            <>
              <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                {t("roundClient.tablesList", { tables: pendingPreview })}
                {pending.length > 6 ? " …" : ""}
              </p>
              <Button variant="outline" size="sm" className="mt-2.5" onClick={onShowPending}>
                {t("roundClient.showThem")}
              </Button>
            </>
          )}
        </div>
      </div>

      {extended.length > 0 && (
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">
            {t("roundClient.extensionsTitle", { count: extended.length })}
          </p>
          <div className="flex flex-col gap-2">
            {extended.map((match) => (
              <div
                key={match.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 dark:border-sky-900 dark:bg-sky-950"
              >
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-sky-800 dark:text-sky-300">
                    {t("roundClient.extensionTable", {
                      table: tableLabel(match),
                      minutes: Math.round((match.extensionSeconds ?? 0) / 60),
                    })}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={busy}
                  onClick={() => onClearExtension(match)}
                >
                  {t("roundClient.extensionEnd")}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <ActivityFeed tournamentId={tournamentId} />
    </aside>
  );
}
