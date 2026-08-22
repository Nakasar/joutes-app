import { Eye, EyeOff, Link2 } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { DECK_VISIBILITY_LABELS, type DeckVisibility } from "@/lib/types/Deck.ts";
import type { DeckCards } from "@/lib/decks/contents.ts";
import { countNonCompliantZones, deckSize } from "@/lib/decks/contents.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";

const VISIBILITY_ICONS = {
  private: EyeOff,
  unlisted: Link2,
  public: Eye,
} as const;

/** Qui voit ce deck, dit de la même façon partout où la question se pose. */
export function DeckVisibilityBadge({
  visibility,
  className,
}: {
  visibility: DeckVisibility;
  className?: string;
}) {
  const Icon = VISIBILITY_ICONS[visibility];
  const { label, hint } = DECK_VISIBILITY_LABELS[visibility];

  return (
    <Badge
      variant={visibility === "public" ? "default" : "secondary"}
      title={hint}
      className={className}
    >
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

/**
 * Conformité du deck au format.
 *
 * Toujours calculé du contenu réel — jamais une valeur portée par le document.
 * Un deck dont on retire trois cartes cesse d'être conforme à la seconde où on
 * les retire, et le badge doit le dire sans attendre un enregistrement.
 */
export function DeckLegalityBadge({
  cards,
  zones,
  className,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  className?: string;
}) {
  const issues = countNonCompliantZones(cards, zones);

  if (issues === 0) {
    return (
      <Badge variant="secondary" className={className}>
        Conforme au format
      </Badge>
    );
  }

  return (
    <Badge
      variant="secondary"
      className={cn("bg-destructive/10 text-destructive", className)}
    >
      {issues} zone{issues > 1 ? "s" : ""} à ajuster
    </Badge>
  );
}

/** Taille du deck, elle aussi additionnée du contenu et non recopiée. */
export function DeckSizeLabel({
  cards,
  zones,
  version,
  className,
}: {
  cards: DeckCards | undefined;
  zones: DeckZone[];
  version?: number;
  className?: string;
}) {
  const size = deckSize(cards, zones);

  return (
    <span className={cn("font-mono text-xs text-muted-foreground", className)}>
      {size} carte{size > 1 ? "s" : ""}
      {version ? ` · v${version}` : ""}
    </span>
  );
}
