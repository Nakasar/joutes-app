import { cn } from "@/lib/utils.ts";
import {
  costCurve,
  deckLegality,
  maxCopies,
  typeSplit,
  type DeckCardInfo,
  type DeckCards,
} from "@/lib/decks/contents.ts";
import { zoneCounterLabel, type DeckZone } from "@/lib/decks/zones.ts";

/** Hauteur, en pixels, du plus haut pilier de la courbe. */
const CURVE_HEIGHT = 64;

/**
 * Courbe de coûts du deck : une colonne par coût, de 0 à « 6+ ».
 *
 * Les colonnes vides gardent un filet de barre plutôt que de disparaître —
 * l'absence de cartes à trois est une information, et une colonne manquante se
 * lirait comme un trou dans le graphique.
 */
export function CostCurve({
  cards,
  zones,
  cardsById,
  className,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  className?: string;
}) {
  const buckets = costCurve(cards, zones, cardsById);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-end gap-1.5" style={{ height: CURVE_HEIGHT }}>
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex flex-1 flex-col items-center justify-end gap-1">
            <span className="font-mono text-[10px] text-muted-foreground">
              {bucket.count > 0 ? bucket.count : ""}
            </span>
            <div
              className={cn(
                "w-full rounded-t-md",
                bucket.count > 0 ? "bg-primary" : "bg-border"
              )}
              style={{ height: Math.max(3, Math.round(bucket.ratio * CURVE_HEIGHT)) }}
              role="presentation"
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        {buckets.map((bucket) => (
          <span
            key={bucket.label}
            className="flex-1 text-center font-mono text-[10px] text-muted-foreground"
          >
            {bucket.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Répartition du deck par type de carte. */
export function TypeSplit({
  cards,
  zones,
  cardsById,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
}) {
  const rows = typeSplit(cards, zones, cardsById);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5 border-t pt-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">{row.label}</span>
          <span className="font-mono">{row.count}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Légalité, zone par zone.
 *
 * La même liste sert le panneau de l'éditeur et la colonne de la page publique :
 * un visiteur doit pouvoir constater qu'une liste publiée est jouable avant de
 * la copier.
 */
export function LegalityList({
  cards,
  zones,
  copyLimit,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  /** Nombre d'exemplaires autorisé d'une même carte ; absent, le contrôle n'est pas affiché. */
  copyLimit?: number;
}) {
  const rows = deckLegality(cards, zones);
  const copies = copyLimit === undefined ? undefined : maxCopies(cards, zones);

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row) => (
        <div key={row.zone.key} className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">{row.zone.label}</span>
          <span
            className={cn(
              "font-mono text-xs",
              row.compliant ? "text-foreground" : "text-destructive"
            )}
          >
            {zoneCounterLabel(row.zone, row.count)} {row.compliant ? "✓" : "✕"}
          </span>
        </div>
      ))}
      {copies !== undefined && (
        <div className="flex items-center justify-between border-t pt-1.5 text-[13px]">
          <span className="text-muted-foreground">Max exemplaires</span>
          <span
            className={cn(
              "font-mono text-xs",
              copies <= copyLimit! ? "text-foreground" : "text-destructive"
            )}
          >
            {copies} / {copyLimit} {copies <= copyLimit! ? "✓" : "✕"}
          </span>
        </div>
      )}
    </div>
  );
}
