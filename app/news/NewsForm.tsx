"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Game } from "@/lib/types/Game";
import { News } from "@/lib/types/News";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import MarkdownEditor from "@/components/MarkdownEditor";
import BannerUploader from "./BannerUploader";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

type NewsFormProps =
  | { mode: "create"; games: Game[]; existingTags: string[] }
  | { mode: "edit"; news: News; games: Game[]; existingTags: string[] };

type FormData = {
  title: string;
  summary: string;
  content: string;
  banner?: string;
  gameIds: string[];
  tags: string[];
};

export default function NewsForm(props: NewsFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";

  const [form, setForm] = useState<FormData>({
    title: isEdit ? props.news.title : "",
    summary: isEdit ? props.news.summary : "",
    content: isEdit ? props.news.content : "",
    banner: isEdit ? props.news.banner : undefined,
    gameIds: isEdit ? props.news.gameIds : [],
    tags: isEdit ? props.news.tags : [],
  });
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleGame = (gameId: string) => {
    setForm((prev) => ({
      ...prev,
      gameIds: prev.gameIds.includes(gameId)
        ? prev.gameIds.filter((id) => id !== gameId)
        : [...prev.gameIds, gameId],
    }));
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || form.tags.includes(trimmed)) return;
    setForm((prev) => ({ ...prev, tags: [...prev.tags, trimmed] }));
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    if (!form.summary.trim()) {
      toast.error("Le résumé est requis");
      return;
    }
    if (!form.content.trim()) {
      toast.error("Le contenu est requis");
      return;
    }

    setIsSubmitting(true);
    try {
      const url = isEdit ? `/api/news/${props.news.id}` : "/api/news";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Une erreur est survenue");
        return;
      }

      const saved: News = await res.json();
      toast.success(isEdit ? "Actualité mise à jour" : "Actualité publiée");
      router.push(`/news/${saved.id}`);
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Bannière */}
      <div className="space-y-2">
        <Label>Bannière</Label>
        <BannerUploader
          value={form.banner}
          onChange={(url) => setForm((prev) => ({ ...prev, banner: url }))}
        />
      </div>

      {/* Titre */}
      <div className="space-y-2">
        <Label htmlFor="title">Titre *</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Titre de l'actualité"
          maxLength={200}
        />
      </div>

      {/* Résumé */}
      <div className="space-y-2">
        <Label htmlFor="summary">Résumé *</Label>
        <Textarea
          id="summary"
          value={form.summary}
          onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
          placeholder="Un court résumé de l'actualité (affiché dans la liste)"
          rows={3}
          maxLength={500}
        />
        <p className="text-xs text-muted-foreground text-right">{form.summary.length}/500</p>
      </div>

      {/* Contenu markdown */}
      <div className="space-y-2">
        <Label>Contenu *</Label>
        <MarkdownEditor
          value={form.content}
          onChange={(v) => setForm((prev) => ({ ...prev, content: v }))}
          placeholder="Rédigez le contenu en Markdown…"
        />
      </div>

      {/* Jeux */}
      {props.games.length > 0 && (
        <div className="space-y-2">
          <Label>Jeux rattachés</Label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {props.games.map((game) => (
              <label
                key={game.id}
                className="flex items-center gap-2 cursor-pointer p-2 rounded border hover:bg-accent transition-colors"
              >
                <Checkbox
                  checked={form.gameIds.includes(game.id)}
                  onCheckedChange={() => toggleGame(game.id)}
                />
                <span className="text-sm">{game.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex flex-wrap gap-2 mb-2">
          {form.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Ajouter un tag (Entrée pour valider)"
            maxLength={50}
          />
          <Button type="button" variant="outline" onClick={() => addTag(tagInput)}>
            Ajouter
          </Button>
        </div>
        {props.existingTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            <span className="text-xs text-muted-foreground mr-1">Tags existants :</span>
            {props.existingTags
              .filter((t) => !form.tags.includes(t))
              .map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, tags: [...prev.tags, t] }))}
                  className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                >
                  {t}
                </button>
              ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Enregistrer les modifications" : "Publier l'actualité"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
