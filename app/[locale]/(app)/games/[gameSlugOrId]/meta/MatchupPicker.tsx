"use client";

import { useState } from "react";

import { cn } from "@/lib/utils.ts";

export type MatchupPickerRow = {
  legend: string;
  image?: string;
  opponents: { legend: string; image?: string; matches: number; record: string; rate: number; rateLabel: string }[];
};

/**
 * Les matchups sur téléphone : la grille ne tient pas, on choisit une légende
 * et ses matchups s'affichent en liste.
 */
export function MatchupPicker({
  rows,
  min,
  labels,
}: {
  rows: MatchupPickerRow[];
  min: number;
  labels: { pick: string; versus: string; few: string };
}) {
  const [legend, setLegend] = useState(rows[0]?.legend ?? "");
  const row = rows.find((candidate) => candidate.legend === legend) ?? rows[0];
  if (!row) return null;

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {labels.pick}
        <select
          value={row.legend}
          onChange={(change) => setLegend(change.target.value)}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {rows.map((candidate) => (
            <option key={candidate.legend} value={candidate.legend}>
              {candidate.legend}
            </option>
          ))}
        </select>
      </label>
      <ul className="flex flex-col">
        {row.opponents.map((opponent) => {
          const few = opponent.matches < min;
          return (
            <li key={opponent.legend} className="flex items-center gap-3 border-t border-border py-2 text-sm">
              {opponent.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={opponent.image} alt="" loading="lazy" className="h-9 w-7 shrink-0 rounded-sm object-cover object-top" />
              ) : (
                <span className="h-9 w-7 shrink-0 rounded-sm bg-muted" aria-hidden />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">
                  {labels.versus} {opponent.legend}
                </span>
                <span className="text-xs text-muted-foreground">
                  {opponent.matches} · {opponent.record}
                  {few && ` · ${labels.few}`}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold tabular-nums",
                  few
                    ? "bg-muted text-muted-foreground"
                    : opponent.rate >= 0.5
                      ? "bg-primary/15 text-primary"
                      : "bg-orange-500/15 text-orange-800 dark:text-orange-300"
                )}
              >
                {opponent.rateLabel}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
