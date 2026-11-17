"use client";

import { useState } from "react";
import { Copy, Download, IdCard, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { SegmentedControl } from "@/components/decks/SegmentedControl.tsx";
import { businessCardFilename, type BusinessCardStyle } from "@/lib/decks/business-card.ts";
import { cn } from "@/lib/utils.ts";

const STYLE_OPTIONS: { value: BusinessCardStyle; label: string }[] = [
  { value: "illustrated", label: "Illustrée" },
  { value: "sober", label: "Sobre" },
];

/**
 * La carte de visite d'un deck : le bouton et son dialogue.
 *
 * L'image est faite par le serveur (`/api/decks/[id]/business-card`) ; le
 * dialogue ne fait que choisir ses options et montrer le résultat avant de le
 * copier, de le partager ou de l'enregistrer.
 */
export function BusinessCardButton({
  deckId,
  deckName,
  isPrivate,
  className,
  variant = "outline",
}: {
  deckId: string;
  deckName: string;
  /** Un deck privé n'a pas de QR code : son lien ne s'ouvrirait pour personne d'autre. */
  isPrivate: boolean;
  className?: string;
  variant?: "outline" | "default" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<BusinessCardStyle>("illustrated");
  const [qr, setQr] = useState(true);
  const [named, setNamed] = useState(true);
  // L'adresse de la dernière image arrivée : tant qu'elle diffère de celle
  // demandée, l'aperçu montre qu'une nouvelle image se prépare.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState<"copy" | "share" | null>(null);

  const query = new URLSearchParams({ style });
  if (!qr || isPrivate) query.set("qr", "0");
  if (!named) query.set("name", "0");
  const src = `/api/decks/${deckId}/business-card?${query}`;
  const filename = businessCardFilename(deckName);

  const loading = loadedSrc !== src;

  // Le partage de fichiers n'existe que sur certains navigateurs (téléphones
  // surtout). Le dialogue ne s'affiche que côté navigateur : on peut le demander ici.
  const canShare =
    open &&
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [new File([new Blob()], filename, { type: "image/png" })] });

  const fetchImage = async () => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.blob();
  };

  const copy = async () => {
    setBusy("copy");
    try {
      // Safari exige que la promesse soit confiée au presse-papiers tout de suite.
      await navigator.clipboard.write([new ClipboardItem({ "image/png": fetchImage() })]);
      toast.success("Image copiée");
    } catch {
      toast.error("Copie impossible", { description: "Téléchargez l'image à la place." });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      const blob = await fetchImage();
      await navigator.share({ files: [new File([blob], filename, { type: "image/png" })], title: deckName });
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Partage impossible", { description: "Téléchargez l'image à la place." });
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Button type="button" variant={variant} className={className} onClick={() => setOpen(true)}>
        <IdCard />
        Carte de visite
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col gap-4 overflow-y-auto sm:max-w-[820px]">
          <DialogHeader>
            <DialogTitle>Carte de visite</DialogTitle>
            <DialogDescription>
              La liste du deck sur une image au format d&apos;une carte à jouer, à partager ou à glisser dans un
              protège-carte.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="relative mx-auto aspect-[750/1048] w-full max-w-[220px] shrink-0 sm:max-w-[330px] overflow-hidden rounded-2xl bg-muted">
              {open && (
                // eslint-disable-next-line @next/next/no-img-element -- image générée à la volée, rien à optimiser
                <img
                  key={src}
                  src={src}
                  alt={`Carte de visite du deck ${deckName}`}
                  className={cn("size-full object-contain transition-opacity", loading && "opacity-40")}
                  onLoad={() => setLoadedSrc(src)}
                  onError={() => setLoadedSrc(src)}
                />
              )}
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Chargement de l'image" />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-5">
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium">Style</span>
                <SegmentedControl label="Style de la carte" value={style} options={STYLE_OPTIONS} onChange={setStyle} className="w-fit" />
                <span className="text-[13px] text-muted-foreground">
                  Sobre : fond blanc, sans illustration, pour l&apos;impression.
                </span>
              </div>

              <div className="flex flex-col gap-3">
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={qr && !isPrivate}
                    disabled={isPrivate}
                    onCheckedChange={(value) => setQr(value === true)}
                  />
                  <span className="flex flex-col gap-0.5">
                    <span>QR code vers le deck</span>
                    <span className="text-[13px] text-muted-foreground">
                      {isPrivate
                        ? "Indisponible : ce deck est privé, son lien ne s'ouvrirait pas."
                        : "Retiré d'office pour un deck privé : le lien ne s'ouvrirait pas."}
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-2.5 text-sm">
                  <Checkbox className="mt-0.5" checked={named} onCheckedChange={(value) => setNamed(value === true)} />
                  <span className="flex flex-col gap-0.5">
                    <span>Nom du deck et auteur</span>
                    <span className="text-[13px] text-muted-foreground">Sous le nom de la légende.</span>
                  </span>
                </label>
              </div>

              <div className="flex flex-col gap-1 rounded-md border bg-muted/40 px-3.5 py-3">
                <span className="font-mono text-xs">PNG · 1 500 × 2 096 px</span>
                <span className="text-[13px] text-muted-foreground">
                  63 × 88 mm, la taille d&apos;une carte, nette à l&apos;impression.
                </span>
              </div>

              <div className="flex flex-wrap justify-end gap-2 sm:mt-auto">
                {canShare && (
                  <Button type="button" variant="outline" onClick={share} disabled={busy !== null}>
                    {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />}
                    Partager
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={copy} disabled={busy !== null}>
                  {busy === "copy" ? <Loader2 className="animate-spin" /> : <Copy />}
                  Copier l&apos;image
                </Button>
                <Button asChild className="font-semibold">
                  <a href={`${src}&download=1`} download={filename}>
                    <Download />
                    Télécharger le PNG
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
