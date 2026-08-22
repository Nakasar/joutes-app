"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { toDeckCardInfo, type RawCard } from "@/lib/decks/card-info.ts";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents.ts";
import { applyDeckText, normalizeCardName, parseDeckText } from "@/lib/decks/text.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";

/**
 * Onglet « Texte » : coller une liste plutôt que de la construire carte à carte.
 *
 * L'appariement se fait côté serveur, contre le catalogue du jeu — le
 * navigateur n'a pas le catalogue, et le télécharger pour lire trente lignes
 * serait payer très cher une commodité. Rien n'est appliqué avant que l'auteur
 * ait vu ce qui a été reconnu : une liste collée de travers ne doit pas
 * remplacer un deck en silence.
 */
export function DeckTextTab({
  value,
  onValueChangeAction,
  zones,
  gameSlug,
  onApplyAction,
}: {
  value: string;
  onValueChangeAction: (value: string) => void;
  zones: DeckZone[];
  gameSlug: string;
  onApplyAction: (cards: DeckCards, catalog: DeckCardInfo[]) => void;
}) {
  const [applying, setApplying] = useState(false);
  const [report, setReport] = useState<{ matched: number; merged: number; unmatched: string[] } | null>(null);

  const parsed = useMemo(() => parseDeckText(value, zones), [value, zones]);
  const sectionLabels = parsed.sections
    .map((key) => zones.find((zone) => zone.key === key)?.label)
    .filter(Boolean)
    .join(", ");

  const apply = async () => {
    if (parsed.lines.length === 0) {
      toast.error("Rien à appliquer", { description: "La liste ne contient aucune carte." });
      return;
    }

    setApplying(true);
    try {
      const names = [...new Set(parsed.lines.map((line) => line.name))];
      const response = await fetch(`/api/games/${gameSlug}/deck-cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });

      if (!response.ok) {
        toast.error("Lecture impossible", { description: "Le catalogue n'a pas répondu." });
        return;
      }

      const data: { matches?: Record<string, RawCard> } = await response.json();
      const byNormalizedName = new Map<string, DeckCardInfo>();
      for (const [name, raw] of Object.entries(data.matches ?? {})) {
        byNormalizedName.set(normalizeCardName(name), toDeckCardInfo(raw));
      }

      const applied = applyDeckText(parsed, (name) => byNormalizedName.get(normalizeCardName(name))?.id);
      setReport({ matched: applied.matched, merged: applied.merged, unmatched: applied.unmatched });

      onApplyAction(applied.cards, [...byNormalizedName.values()]);
      toast.success("Liste appliquée", {
        description: `${applied.matched} ligne${applied.matched > 1 ? "s" : ""} appariée${applied.matched > 1 ? "s" : ""}.`,
      });
    } catch (error) {
      console.error("Error applying deck text:", error);
      toast.error("Lecture impossible", { description: "Une erreur est survenue." });
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_240px] lg:items-start">
      <div className="overflow-hidden rounded-xl border">
        <header className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/50 px-3.5 py-2.5">
          <h3 className="text-sm font-semibold">Liste collée</h3>
          <span className="text-xs text-muted-foreground">Les en-têtes de section sont reconnus</span>
        </header>
        <Textarea
          value={value}
          onChange={(event) => onValueChangeAction(event.target.value)}
          rows={20}
          maxLength={20000}
          placeholder={"Légende :\n1 Voix de la Faille\n\nDeck principal :\n3 Éclat de Faille"}
          className="field-sizing-fixed rounded-none border-0 font-mono text-[13px] leading-[22px] focus-visible:ring-0"
        />
      </div>

      <aside className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <h3 className="text-sm font-semibold">Reconnu</h3>
        <dl className="flex flex-col gap-1.5 text-[13px]">
          <Row label="Sections" value={sectionLabels || "aucune"} />
          <Row label="Lignes lues" value={String(parsed.lines.length)} />
          {report && <Row label="Cartes appariées" value={String(report.matched)} />}
          {report && report.merged > 0 && <Row label="Doublons fusionnés" value={String(report.merged)} />}
        </dl>

        {report && report.unmatched.length > 0 && (
          <p className="text-xs text-destructive">
            {report.unmatched.length} ligne{report.unmatched.length > 1 ? "s" : ""} sans carte
            correspondante&nbsp;: {report.unmatched.slice(0, 5).join(", ")}
            {report.unmatched.length > 5 ? "…" : ""}
          </p>
        )}

        <Button type="button" onClick={apply} disabled={applying}>
          {applying && <Loader2 className="animate-spin" />}
          Appliquer au deck
        </Button>
        <p className="text-xs text-muted-foreground">
          Remplace le contenu des zones nommées dans la liste.
        </p>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-xs">{value}</dd>
    </div>
  );
}
