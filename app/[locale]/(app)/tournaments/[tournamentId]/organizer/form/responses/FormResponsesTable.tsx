"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ArrowLeft, FileSpreadsheet, Search } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { cn } from "@/lib/utils.ts";
import type { FormResponseRow } from "@/lib/tournaments/form-export.ts";
import type { TournamentFormFieldType } from "@/lib/types/Tournament.ts";
import { OrganizerPageHeader } from "../../OrganizerPageHeader.tsx";

/** Une ligne telle que sérialisée pour le client : la date passe en ISO. */
export type ResponseRow = Omit<FormResponseRow, "answeredAt"> & { answeredAt?: string };

type ResponseField = { id: string; label: string; type: TournamentFormFieldType };

/**
 * Le tableau des réponses. Un filtre par nom et un interrupteur « seulement
 * ceux qui ont répondu » suffisent : l'organisation cherche qui n'a pas rendu
 * sa liste, ou ce qu'a répondu untel — pas à trier vingt colonnes.
 */
export function FormResponsesTable({
  tournamentId,
  fields,
  rows,
}: {
  tournamentId: string;
  fields: ResponseField[];
  rows: ResponseRow[];
}) {
  const t = useTranslations("Tournaments");
  const [query, setQuery] = useState("");
  const [answeredOnly, setAnsweredOnly] = useState(false);

  const answeredCount = rows.filter((row) => row.answered).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (answeredOnly && !row.answered) return false;
      if (needle && !row.label.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, query, answeredOnly]);

  const base = `/tournaments/${tournamentId}/organizer`;

  return (
    <div>
      <OrganizerPageHeader
        title={t("form.responses.title")}
        description={t("form.responses.description", { answered: answeredCount, total: rows.length })}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`${base}/form`}>
                <ArrowLeft className="size-4" />
                {t("form.responses.backToForm")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              {/* Téléchargement direct : la route renvoie le CSV en pièce jointe. */}
              <a href={`/api/tournaments/${tournamentId}/form/export`} download>
                <FileSpreadsheet className="size-4" />
                {t("form.responses.downloadCsv")}
              </a>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("form.responses.searchPlaceholder")}
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={answeredOnly} onCheckedChange={setAnsweredOnly} />
          {t("form.responses.answeredOnly")}
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              <th className="sticky left-0 z-10 bg-muted/50 px-4 py-2.5 text-left font-semibold backdrop-blur">
                {t("matchExport.columns.player")}
              </th>
              {fields.map((field) => (
                <th key={field.id} className="min-w-40 px-4 py-2.5 text-left font-semibold">
                  {field.label}
                </th>
              ))}
              <th className="whitespace-nowrap px-4 py-2.5 text-left font-semibold">
                {t("form.responses.columnAnsweredAt")}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.playerId} className="border-b align-top last:border-b-0">
                <td
                  className={cn(
                    "sticky left-0 z-10 bg-card px-4 py-2.5 font-medium",
                    row.status === "dropped" && "text-muted-foreground line-through"
                  )}
                >
                  <Link
                    href={`${base}/players/${row.playerId}`}
                    className="hover:underline"
                  >
                    {row.label}
                  </Link>
                  {row.late && (
                    <span
                      className="ml-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
                      title={t("form.lateBadgeTitle")}
                    >
                      {t("form.lateBadge")}
                    </span>
                  )}
                </td>
                {row.cells.map((cell, index) => (
                  <td
                    key={fields[index]?.id ?? index}
                    className={cn("px-4 py-2.5", cell.text === "" && "text-muted-foreground")}
                  >
                    {cell.text === "" ? (
                      "—"
                    ) : (
                      <>
                        {/* Le texte complet (une liste de deck) reste lisible
                            au survol, sans allonger la ligne. */}
                        <span
                          className={cn(
                            "block max-w-64 whitespace-pre-wrap [overflow-wrap:anywhere]",
                            cell.summary !== cell.text && "cursor-help underline decoration-dotted"
                          )}
                          title={cell.summary !== cell.text ? cell.text : undefined}
                        >
                          {cell.summary}
                        </span>
                        {cell.warnings.length > 0 && (
                          <span className="mt-1 block text-xs text-amber-700 dark:text-amber-300">
                            {cell.warnings.join(" · ")}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                ))}
                <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
                  {row.answeredAt ? DateTime.fromISO(row.answeredAt).toFormat("dd/MM HH:mm") : "—"}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={fields.length + 2} className="px-4 py-4 text-center text-muted-foreground">
                  {rows.length === 0 ? t("puzzleBoard.noPlayers") : t("form.responses.noMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
