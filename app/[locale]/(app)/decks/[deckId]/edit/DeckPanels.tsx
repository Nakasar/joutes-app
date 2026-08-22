"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { Textarea } from "@/components/ui/textarea.tsx";
import { CostCurve, LegalityList, TypeSplit } from "@/components/decks/DeckAnalysis.tsx";
import { DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { cn } from "@/lib/utils.ts";
import { collectionCoverage, deckSize, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";

type PanelKey = "stats" | "legality" | "collection" | "notes" | "versions" | "preview";

const INITIAL_PANELS: Record<PanelKey, boolean> = {
  stats: true,
  legality: true,
  collection: false,
  notes: false,
  versions: false,
  preview: false,
};

/**
 * Colonne d'analyse de l'éditeur : six panneaux repliables.
 *
 * Tout y est dérivé du contenu en cours d'édition, jamais du deck enregistré :
 * retirer une carte doit faire bouger la courbe et la légalité tout de suite,
 * sinon les panneaux commentent un deck qui n'existe plus.
 */
export function DeckPanels({
  cards,
  zones,
  cardsById,
  notes,
  onNotesChangeAction,
  ownedByCardId,
  version,
  updatedAt,
  copyLimit,
  preview,
}: {
  cards: DeckCards;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  notes: string;
  onNotesChangeAction: (notes: string) => void;
  /** Exemplaires possédés par identifiant de carte ; absent = visiteur non connecté. */
  ownedByCardId?: Map<string, number>;
  version: number;
  updatedAt: string;
  copyLimit?: number;
  /** Dernière carte survolée, dans le catalogue ou dans le deck. */
  preview?: DeckCardInfo;
}) {
  const [panels, setPanels] = useState(INITIAL_PANELS);
  const toggle = (key: PanelKey) => setPanels((current) => ({ ...current, [key]: !current[key] }));

  const size = deckSize(cards, zones);
  // Recalculée à chaque rendu : le panneau doit commenter le deck en cours
  // d'édition, pas celui qui a été chargé.
  const coverage = ownedByCardId ? collectionCoverage(cards, zones, ownedByCardId) : undefined;

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title="Statistiques"
        summary={`${size} carte${size > 1 ? "s" : ""}`}
        open={panels.stats}
        onToggleAction={() => toggle("stats")}
      >
        <CostCurve cards={cards} zones={zones} cardsById={cardsById} />
        <TypeSplit cards={cards} zones={zones} cardsById={cardsById} />
      </Panel>

      <Panel
        title="Légalité"
        summary={`${zones.length} zone${zones.length > 1 ? "s" : ""}`}
        open={panels.legality}
        onToggleAction={() => toggle("legality")}
      >
        <LegalityList cards={cards} zones={zones} copyLimit={copyLimit} />
      </Panel>

      <Panel
        title="Collection"
        summary={coverage ? `${coverage.owned} possédée${coverage.owned > 1 ? "s" : ""}` : "hors ligne"}
        open={panels.collection}
        onToggleAction={() => toggle("collection")}
      >
        {coverage ? (
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Possédées</span>
              <span className="font-mono text-xs">
                {coverage.owned} / {size}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Manquantes</span>
              <span className={cn("font-mono text-xs", coverage.missing > 0 && "text-destructive")}>
                {coverage.missing}
              </span>
            </div>
            {coverage.missingCardIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Il vous manque&nbsp;:{" "}
                {coverage.missingCardIds
                  .slice(0, 6)
                  .map((id) => cardsById.get(id)?.name ?? id)
                  .join(", ")}
                {coverage.missingCardIds.length > 6 ? "…" : ""}
              </p>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Connectez-vous pour comparer ce deck à votre collection.
          </p>
        )}
      </Panel>

      <Panel
        title="Notes du deck"
        summary={notes ? "renseignées" : "vides"}
        open={panels.notes}
        onToggleAction={() => toggle("notes")}
      >
        <Textarea
          value={notes}
          onChange={(event) => onNotesChangeAction(event.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="Aide-mémoire, essais en cours, cartes à tester…"
          className="text-[13px] leading-5"
        />
        <p className="text-xs text-muted-foreground">
          Ces notes ne sont visibles que par vous.
        </p>
      </Panel>

      <Panel
        title="Versions"
        summary={`v${version}`}
        open={panels.versions}
        onToggleAction={() => toggle("versions")}
      >
        {/*
          L'historique complet supposerait de garder chaque état du deck. Tant
          qu'il n'est pas conservé, ce panneau dit ce qu'il sait — le numéro de
          version courant et sa date — plutôt que d'aligner de fausses lignes.
        */}
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">v{version} — en cours</span>
          <span className="font-mono text-xs">{updatedAt}</span>
        </div>
      </Panel>

      <Panel
        title="Aperçu carte"
        summary={preview ? preview.name : "survolez une carte"}
        open={panels.preview}
        onToggleAction={() => toggle("preview")}
      >
        {preview ? (
          <div className="flex items-start gap-3">
            <DeckCardThumb card={preview} className="w-24 shrink-0" />
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-semibold">{preview.name}</span>
              <span className="text-xs text-muted-foreground">
                {[preview.type, preview.domain?.join(" / "), preview.cost !== undefined ? `coût ${preview.cost}` : undefined]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground">
            Survolez une carte du catalogue ou du deck pour la voir ici.
          </p>
        )}
      </Panel>
    </div>
  );
}

function Panel({
  title,
  summary,
  open,
  onToggleAction,
  children,
}: {
  title: string;
  summary: string;
  open: boolean;
  onToggleAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border bg-card">
      <button
        type="button"
        onClick={onToggleAction}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left transition-colors hover:bg-muted/50"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className="text-[13px] font-semibold">{title}</span>
          <span className="truncate text-xs text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="flex flex-col gap-2.5 border-t px-3.5 py-3">{children}</div>}
    </section>
  );
}
