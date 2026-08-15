"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { NewsSource } from "@/lib/types/News";

export type ImportedNewsDraft = {
  title: string;
  summary: string;
  content: string;
  banner?: string;
  source: NewsSource;
  images: { rehosted: number; keptRemote: number };
  bannerMissed: boolean;
  cardsDetected: boolean;
};

type Props = {
  /** Jeu rattaché à l'actualité : sans lui, les noms de cartes ne sont pas détectés. */
  gameId?: string;
  /** Vrai si le formulaire porte déjà un titre ou un contenu, que l'import remplacerait. */
  hasContent: boolean;
  /** Le brouillon remplit le formulaire, il n'est jamais publié directement. */
  onImported: (draft: ImportedNewsDraft) => void;
};

/**
 * Reprend une actualité publiée ailleurs — le site officiel d'un jeu, le plus
 * souvent — en gardant sa mise en page et ses images, et en mettant entre
 * crochets les noms de cartes du jeu rattaché pour qu'ils deviennent des liens
 * à la lecture.
 *
 * Le résultat atterrit dans le formulaire, où il est relu et corrigé avant
 * publication ; la source y est renseignée pour être citée sur l'actualité.
 */
export default function NewsImportDialog({ gameId, hasContent, onImported }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  const handleImport = async () => {
    const trimmed = url.trim();
    if (!trimmed) {
      toast.error("Collez l'adresse de l'article à importer");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/news/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed, gameId: gameId || undefined }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "L'import de l'article a échoué");
        return;
      }

      const draft = data as ImportedNewsDraft;
      onImported(draft);
      setUrl("");
      setOpen(false);

      const notes = [
        `${draft.images.rehosted} image${draft.images.rehosted === 1 ? "" : "s"} reprise${draft.images.rehosted === 1 ? "" : "s"}`,
      ];
      if (draft.images.keptRemote > 0) {
        notes.push(`${draft.images.keptRemote} laissée${draft.images.keptRemote === 1 ? "" : "s"} chez la source`);
      }
      if (draft.bannerMissed) {
        notes.push("bannière à téléverser");
      }
      if (!draft.cardsDetected) {
        notes.push("noms de cartes non détectés");
      }

      toast.success(`Article importé — ${notes.join(", ")}. Relisez avant de publier.`);
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Importer depuis un lien
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer une actualité depuis un lien</DialogTitle>
          <DialogDescription>
            Collez l&apos;adresse d&apos;un article — la FAQ d&apos;une sortie sur le site officiel, une note de mise à
            jour. Sa mise en page et ses images sont reprises, et la source est citée sur l&apos;actualité.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <Input
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!loading) handleImport();
              }
            }}
            placeholder="https://exemple.com/news/…"
            disabled={loading}
          />

          <p className="text-xs text-muted-foreground">
            {gameId
              ? "Les noms de cartes du jeu rattaché seront mis entre crochets, comme avec la loupe ; les mots-clés de règles sont reconnus à l'affichage."
              : "Rattachez un jeu à l'actualité avant l'import pour que les noms de cartes soient détectés."}
          </p>

          {hasContent && (
            <p className="text-xs text-destructive">
              Le titre, le résumé et le contenu déjà saisis seront remplacés par ceux de l&apos;article importé.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Annuler
          </Button>
          <Button type="button" onClick={handleImport} disabled={loading || !url.trim()}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {loading ? "Import en cours…" : "Importer l'article"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
