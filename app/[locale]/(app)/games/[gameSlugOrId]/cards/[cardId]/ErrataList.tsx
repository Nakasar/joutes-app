"use client";

import { useState, type ReactNode } from "react";

/**
 * Une entrée déjà rendue par le serveur. Le tri et le filtrage se font ici,
 * mais le contenu reste rendu côté serveur : les errata portent du Markdown
 * annoté, des liens de cartes et des traductions qu'il n'y a aucune raison de
 * refaire dans le navigateur.
 */
export type ErrataEntry = {
  id: string;
  type: string;
  /**
   * Déprécié, ou plus de votes contre que pour. Ces entrées restent
   * consultables mais sortent de la lecture principale : sur une carte
   * discutée, elles noient les rulings qui font consensus.
   */
  muted: boolean;
  node: ReactNode;
};

export default function ErrataList({
  entries,
  typeLabels,
  allLabel,
  emptyForFilter,
  showMutedLabel,
  hideMutedLabel,
}: {
  entries: ErrataEntry[];
  typeLabels: Record<string, string>;
  allLabel: string;
  emptyForFilter: string;
  showMutedLabel: string;
  hideMutedLabel: string;
}) {
  const [type, setType] = useState("all");
  const [showMuted, setShowMuted] = useState(false);

  // Seuls les types réellement présents méritent un onglet.
  const presentTypes = [...new Set(entries.map((entry) => entry.type))].filter((key) => typeLabels[key]);
  const matching = entries.filter((entry) => type === "all" || entry.type === type);
  const visible = matching.filter((entry) => !entry.muted);
  const muted = matching.filter((entry) => entry.muted);

  return (
    <div className="flex flex-col gap-4">
      {presentTypes.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {[{ key: "all", label: allLabel }, ...presentTypes.map((key) => ({ key, label: typeLabels[key] }))].map(
            (tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setType(tab.key)}
                aria-pressed={type === tab.key}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  type === tab.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 opacity-60">
                  {tab.key === "all" ? entries.length : entries.filter((entry) => entry.type === tab.key).length}
                </span>
              </button>
            )
          )}
        </div>
      ) : null}

      {visible.length === 0 && muted.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyForFilter}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {visible.map((entry) => (
          <div key={entry.id}>{entry.node}</div>
        ))}
      </div>

      {muted.length > 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30">
          <button
            type="button"
            onClick={() => setShowMuted((open) => !open)}
            aria-expanded={showMuted}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-muted-foreground"
          >
            <span>{showMuted ? hideMutedLabel : showMutedLabel}</span>
            <span className="flex items-center gap-2">
              <span className="font-mono text-xs">{muted.length}</span>
              {showMuted ? "−" : "+"}
            </span>
          </button>
          {showMuted ? (
            <div className="flex flex-col gap-3 px-4 pb-4">
              {muted.map((entry) => (
                <div key={entry.id}>{entry.node}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
