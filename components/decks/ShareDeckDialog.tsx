"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { cn } from "@/lib/utils.ts";
import { DECK_VISIBILITIES, DECK_VISIBILITY_LABELS, type DeckVisibility } from "@/lib/types/Deck.ts";

/** Ce que dit le lien selon l'état retenu — c'est là que se joue la compréhension des trois visibilités. */
const LINK_NOTES: Record<DeckVisibility, string> = {
  public: "Le deck apparaît dans la librairie publique et peut être copié.",
  unlisted:
    "Seules les personnes qui ont le lien y accèdent ; il reste absent de la librairie.",
  private: "Personne d'autre que vous ne peut ouvrir ce deck.",
};

/**
 * Partage d'un deck : choisir qui le voit, puis récupérer de quoi le
 * transmettre.
 *
 * Le choix ne s'applique qu'au bouton « Appliquer ». Changer la visibilité d'un
 * deck est une décision — la publier au moment où le curseur passe sur une
 * option n'en est pas une.
 */
export function ShareDeckDialog({
  open,
  onOpenChange,
  deckId,
  deckName,
  visibility,
  onVisibilityChangeAction,
  exportCode,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  visibility: DeckVisibility;
  onVisibilityChangeAction: (visibility: DeckVisibility) => Promise<void> | void;
  /** Code d'export du jeu, quand il en a un. */
  exportCode?: string;
}) {
  const [selected, setSelected] = useState<DeckVisibility>(visibility);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  // Rouvrir le dialogue doit repartir de l'état réel du deck, pas du choix
  // abandonné la fois précédente.
  useEffect(() => {
    if (open) {
      setSelected(visibility);
      setCopied(null);
    }
  }, [open, visibility]);

  const link = typeof window === "undefined" ? "" : `${window.location.origin}/decks/${deckId}`;

  const copy = async (value: string, kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Copie impossible", { description: "Le presse-papiers n'est pas accessible." });
    }
  };

  const apply = async () => {
    if (selected === visibility) {
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      await onVisibilityChangeAction(selected);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Partager «&nbsp;{deckName}&nbsp;»</DialogTitle>
          <DialogDescription>
            Choisissez qui peut ouvrir ce deck, puis copiez le lien ou le code d&apos;export.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
          <div className="flex flex-col gap-2">
            {DECK_VISIBILITIES.map((option) => {
              const { label, hint } = DECK_VISIBILITY_LABELS[option];
              const active = option === selected;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSelected(option)}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors",
                    active ? "border-primary bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold">{label}</span>
                    <span className="text-[13px] text-muted-foreground">{hint}</span>
                  </span>
                  {active && (
                    <span className="shrink-0 text-xs text-muted-foreground">sélectionné</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold">Lien</span>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={selected === "private" ? "lien désactivé tant que le deck est privé" : link}
                disabled={selected === "private"}
                className="min-w-0 flex-1 font-mono text-[13px]"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                disabled={selected === "private"}
                onClick={() => copy(link, "link")}
              >
                {copied === "link" ? <Check /> : <Copy />}
                Copier
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{LINK_NOTES[selected]}</p>
          </div>

          {exportCode && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Code d&apos;export</span>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  readOnly
                  value={exportCode}
                  className="min-w-0 flex-1 font-mono text-[13px]"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="outline" onClick={() => copy(exportCode, "code")}>
                  {copied === "code" ? <Check /> : <Copy />}
                  Copier
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Se colle dans le client du jeu et dans le deck-checker.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Fermer
          </Button>
          <Button type="button" onClick={apply} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
