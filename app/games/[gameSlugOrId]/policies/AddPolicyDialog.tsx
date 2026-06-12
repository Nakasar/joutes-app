"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { createPolicy } from "./actions";

export default function AddPolicyDialog({ gameId }: { gameId: string; gameSlug: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [ReactMarkdown, setReactMarkdown] = useState<React.ComponentType<{ children: string; remarkPlugins?: unknown[]; rehypePlugins?: unknown[] }> | null>(null);

  const openDialog = async (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen && !ReactMarkdown) {
      const [{ default: MD }, { default: remarkGfm }, { default: rehypeRaw }] = await Promise.all([
        import("react-markdown"),
        import("remark-gfm"),
        import("rehype-raw"),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setReactMarkdown(() => (props: any) => <MD remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]} {...props} />);
    }
    if (!isOpen) {
      setPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setIsSubmitting(true);
    try {
      await createPolicy({
        gameId,
        title: title.trim(),
        content: content.trim(),
        source: source.trim() || undefined,
      });
      setOpen(false);
      setTitle("");
      setContent("");
      setSource("");
      setPreview(false);
    } catch (error) {
      console.error("Erreur lors de la création de la policy:", error);
      alert("Erreur lors de la création de la policy");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button>Ajouter une policy</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ajouter une policy</DialogTitle>
            <DialogDescription>
              Rédigez une règle ou précision officielle. Le contenu supporte le Markdown (images, liens, tableaux…).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="title" className="text-sm font-medium">Titre</label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Règle sur les effets simultanés"
                required
              />
            </div>
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <label htmlFor="content" className="text-sm font-medium">Contenu (Markdown)</label>
                <button
                  type="button"
                  onClick={() => setPreview((v) => !v)}
                  className="text-xs text-muted-foreground underline hover:text-foreground"
                >
                  {preview ? "Éditer" : "Prévisualiser"}
                </button>
              </div>
              {preview && ReactMarkdown ? (
                <div className="min-h-[200px] rounded-md border border-input bg-muted/40 px-4 py-3 prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{content}</ReactMarkdown>
                </div>
              ) : (
                <textarea
                  id="content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  className="min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                  placeholder="Rédigez le contenu en Markdown...&#10;&#10;Exemples :&#10;**Gras**, *italique*, [lien](https://...), ![image](https://...)&#10;&#10;| Col 1 | Col 2 |&#10;|-------|-------|&#10;| val   | val   |"
                />
              )}
              <p className="text-xs text-muted-foreground">
                Supporte le Markdown : **gras**, *italique*, [liens](url), ![images](url), tableaux, listes…
              </p>
            </div>
            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">Source (optionnel)</label>
              <Input
                id="source"
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://exemple.com/regles"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isSubmitting}>
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting || !title.trim() || !content.trim()}>
              {isSubmitting ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

