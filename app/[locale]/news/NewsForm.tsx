"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Game } from "@/lib/types/Game";
import { News, NewsSource } from "@/lib/types/News";
import { locales, localeLabels, type Locale } from "@/i18n/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import MarkdownEditor from "@/components/MarkdownEditor";
import BannerUploader from "./BannerUploader";
import NewsImportDialog, { type ImportedNewsDraft } from "./NewsImportDialog";
import { toast } from "sonner";
import { ExternalLink, Loader2, X } from "lucide-react";

type NewsFormProps =
  | { mode: "create"; games: Game[]; existingTags: string[]; defaultLang: Locale }
  | { mode: "edit"; news: News; games: Game[]; existingTags: string[]; defaultLang: Locale };

type FormData = {
  title: string;
  summary: string;
  content: string;
  /** La langue dans laquelle l'actualité est écrite : sa VO. */
  originalLang: Locale;
  banner?: string;
  /** `null` retire l'attribution ; `undefined` la laisse telle qu'elle est en base. */
  source?: NewsSource | null;
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
    originalLang: isEdit ? props.news.originalLang : props.defaultLang,
    banner: isEdit ? props.news.banner : undefined,
    source: isEdit ? (props.news.source ?? null) : null,
    gameIds: isEdit ? props.news.gameIds : [],
    tags: isEdit ? props.news.tags : [],
  });
  const [tagInput, setTagInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Un seul jeu rattaché suffit à désigner le catalogue de cartes interrogé
  // par l'import ; avec plusieurs, il n'y a pas de choix évident, et la page
  // de l'actualité ne résout d'ailleurs pas non plus les mentions de cartes.
  const importGameId = form.gameIds.length === 1 ? form.gameIds[0] : undefined;

  /**
   * L'article importé remplace le brouillon en cours plutôt que de s'y
   * ajouter : c'est un texte entier, pas un bloc de plus. Les jeux et les tags
   * déjà cochés sont conservés — la source ne les connaît pas.
   */
  const applyImport = (draft: ImportedNewsDraft) => {
    setForm((prev) => ({
      ...prev,
      title: draft.title,
      summary: draft.summary,
      content: draft.content,
      // La page dit dans quelle langue elle est écrite : le texte importé est
      // la VO de l'actualité, et c'est depuis elle que les traductions se font.
      originalLang: draft.lang ?? prev.originalLang,
      banner: draft.banner ?? prev.banner,
      source: draft.source,
    }));
  };

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

    // Une source à moitié saisie ne veut rien dire : citer un site sans lien
    // n'aide personne à vérifier, et un lien sans nom ne s'affiche pas.
    const sourceName = form.source?.name.trim() ?? "";
    const sourceUrl = form.source?.url.trim() ?? "";
    if (!sourceName !== !sourceUrl) {
      toast.error("Renseignez le nom de la source et son lien, ou laissez les deux vides");
      return;
    }
    const source = sourceName && sourceUrl ? { name: sourceName, url: sourceUrl } : null;

    setIsSubmitting(true);
    try {
      const url = isEdit ? `/api/news/${props.news.id}` : "/api/news";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, source }),
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
      {/* Import depuis un site extérieur */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
        <p className="text-sm text-muted-foreground">
          Reprendre un article publié ailleurs, avec sa mise en page et ses images.
        </p>
        <NewsImportDialog
          gameId={importGameId}
          hasContent={!!form.title.trim() || !!form.content.trim()}
          onImported={applyImport}
        />
      </div>

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

      {/* Langue d'origine */}
      <div className="space-y-2">
        <Label htmlFor="originalLang">Langue de rédaction</Label>
        <select
          id="originalLang"
          value={form.originalLang}
          onChange={(e) => setForm((prev) => ({ ...prev, originalLang: e.target.value as Locale }))}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm sm:w-64"
        >
          {locales.map((lang) => (
            <option key={lang} value={lang}>
              {localeLabels[lang]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          La version originale de l&apos;actualité. Les autres langues se saisissent ensuite depuis le menu
          « Traduire » de sa page, et chacune a son adresse.
        </p>
      </div>

      {/* Source officielle */}
      <div className="space-y-2">
        <Label>Source</Label>
        <p className="text-xs text-muted-foreground">
          À renseigner quand l&apos;actualité reprend un article publié ailleurs : son origine est alors citée et
          liée sur la page de l&apos;actualité. Rempli automatiquement par l&apos;import.
        </p>
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <Input
            aria-label="Nom de la source"
            value={form.source?.name ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                source: { name: e.target.value, url: prev.source?.url ?? "" },
              }))
            }
            placeholder="Nom du site (ex. : Riftbound)"
            maxLength={120}
          />
          <Input
            type="url"
            inputMode="url"
            aria-label="Lien vers l'article d'origine"
            value={form.source?.url ?? ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                source: { name: prev.source?.name ?? "", url: e.target.value },
              }))
            }
            placeholder="https://exemple.com/news/…"
          />
        </div>
        {(form.source?.name || form.source?.url) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setForm((prev) => ({ ...prev, source: null }))}
            >
              <X className="h-3 w-3 mr-1" />
              Retirer la source
            </Button>
            {form.source?.url && (
              <a
                href={form.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-3 w-3" />
                Ouvrir l&apos;article d&apos;origine
              </a>
            )}
          </div>
        )}
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
