"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
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
import { DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { DeckCoverImage } from "@/components/decks/DeckCover.tsx";
import { cn } from "@/lib/utils.ts";
import { deckCoverCandidates, resolveDeckCover, type DeckCover } from "@/lib/decks/cover.ts";
import type { DeckCardInfo, DeckCards } from "@/lib/decks/contents.ts";
import type { DeckZone } from "@/lib/decks/zones.ts";

/** Ce qu'un choix de couverture écrit sur le deck. */
export type DeckCoverChoice = {
  /** Carte du deck retenue ; `""` retire le choix et rend la main à la légende. */
  coverCardId: string;
  /** Image déposée ; `""` la retire. */
  coverImageUrl: string;
};

/**
 * Le choix de l'illustration d'un deck : une de ses cartes, ou une image à soi.
 *
 * Les deux moyens dans le même dialogue parce qu'ils répondent à la même
 * question, et qu'ils s'excluent : déposer une image l'emporte sur la carte
 * désignée — c'est le geste le plus explicite des deux, et le plus récent.
 * L'aperçu montre le cadrage réel, en bandeau, tel que les listes l'afficheront.
 *
 * Rien ne part avant « Appliquer », sauf le fichier : il faut bien qu'il soit
 * déposé pour qu'on puisse le regarder. Fermer sans appliquer laisse donc le
 * deck sur sa couverture précédente — le fichier, lui, reste dans le stockage,
 * comme partout ailleurs sur le site.
 */
export function DeckCoverDialog({
  open,
  onOpenChange,
  deckId,
  deckName,
  cards,
  zones,
  cardsById,
  coverCardId,
  coverImageUrl,
  legendCardId,
  onApplyAction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  deckName: string;
  cards: DeckCards | undefined;
  zones: DeckZone[];
  cardsById: Map<string, DeckCardInfo>;
  coverCardId?: string;
  coverImageUrl?: string;
  legendCardId?: string;
  onApplyAction: (choice: DeckCoverChoice) => Promise<boolean>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedCardId, setSelectedCardId] = useState(coverCardId ?? "");
  const [uploadedUrl, setUploadedUrl] = useState(coverImageUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Rouvrir doit repartir de la couverture du deck, pas du choix abandonné la
  // fois d'avant.
  useEffect(() => {
    if (open) {
      setSelectedCardId(coverCardId ?? "");
      setUploadedUrl(coverImageUrl ?? "");
    }
  }, [open, coverCardId, coverImageUrl]);

  // Seules les cartes que le catalogue sait illustrer : une vignette vide ne
  // dit rien de ce que la couverture donnerait.
  const candidates = useMemo(
    () =>
      deckCoverCandidates(cards, zones)
        .map((id) => cardsById.get(id))
        .filter((card): card is DeckCardInfo => Boolean(card?.image)),
    [cards, zones, cardsById]
  );

  const preview = resolveDeckCover(
    { coverImageUrl: uploadedUrl || undefined, coverCardId: selectedCardId || undefined, legendCardId },
    cardsById
  );

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch(`/api/decks/${deckId}/cover`, { method: "POST", body });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        toast.error(payload.error ?? "Téléversement impossible");
        return;
      }

      setUploadedUrl(payload.url);
    } catch {
      toast.error("Téléversement impossible");
    } finally {
      setUploading(false);
      // Le même fichier rechoisi doit relancer un téléversement : sans cette
      // remise à zéro, `change` ne se déclenche pas deux fois de suite.
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const apply = async () => {
    setSaving(true);
    try {
      const ok = await onApplyAction({ coverCardId: selectedCardId, coverImageUrl: uploadedUrl });

      if (ok) {
        onOpenChange(false);
      }
    } catch (error) {
      // Sans le `finally`, une exception laisserait « Appliquer » désactivé
      // pour de bon : le dialogue resterait ouvert sur un bouton mort, et il
      // faudrait recharger la page pour choisir sa couverture.
      console.error("Error applying deck cover:", error);
      toast.error("Couverture non enregistrée", { description: "Une erreur est survenue." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Couverture du deck</DialogTitle>
          <DialogDescription>
            L&apos;image qui illustre {deckName} dans la librairie, sur l&apos;accueil et partout où
            il est listé.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <DeckCoverImage
            cover={preview}
            name={deckName}
            rounded="rounded-lg"
            className="aspect-[16/7] w-full border"
          />
          <p className="text-xs text-muted-foreground">
            {preview.source === "upload"
              ? "Votre image. Elle prime sur la carte choisie."
              : preview.source === "card"
                ? "Une carte du deck."
                : preview.source === "legend"
                  ? "Par défaut, la carte qui donne son identité au deck."
                  : "Aucune illustration : le deck s'affiche en aplat."}
          </p>
        </div>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Votre image</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
                {uploadedUrl ? "Remplacer" : "Téléverser"}
              </Button>
              {uploadedUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={uploading}
                  onClick={() => setUploadedUrl("")}
                >
                  <Trash2 />
                  Retirer
                </Button>
              )}
            </div>
          </div>
          <p className="font-mono text-[11px] text-muted-foreground">
            JPG, PNG, WebP ou GIF — 5 Mo maximum. Un format panoramique se cadre le mieux.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void upload(file);
              }
            }}
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Une carte du deck</h3>
            {selectedCardId && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCardId("")}
              >
                Par défaut
              </Button>
            )}
          </div>

          {candidates.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              Aucune carte de ce deck n&apos;a d&apos;illustration. Téléversez une image pour lui en
              donner une.
            </p>
          ) : (
            <ul className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
              {candidates.map((card) => {
                const chosen = card.id === selectedCardId;

                return (
                  <li key={card.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      title={card.name}
                      onClick={() => setSelectedCardId(chosen ? "" : card.id)}
                      className={cn(
                        "block w-full rounded-lg ring-offset-2 ring-offset-background transition-shadow",
                        chosen && "ring-2 ring-primary"
                      )}
                    >
                      <DeckCardThumb card={card} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" onClick={apply} disabled={saving || uploading}>
            {saving && <Loader2 className="animate-spin" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Le bouton qui ouvre le choix, avec la couverture courante en pastille. */
export function DeckCoverButton({
  onClick,
  cover,
}: {
  onClick: () => void;
  cover: DeckCover;
}) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {cover.image ? (
        <DeckCoverImage cover={cover} rounded="rounded-[3px]" className="size-4 shrink-0" />
      ) : (
        <ImagePlus />
      )}
      Couverture
    </Button>
  );
}
