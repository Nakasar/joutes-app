"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MarkdownEditor from "@/components/MarkdownEditor";
import NewsImportDialog, { type ImportedNewsDraft } from "@/app/[locale]/news/NewsImportDialog";
import { localeLabels, type Locale } from "@/i18n/config";

type Texts = { title: string; summary: string; content: string };

/**
 * Traduction d'une actualité : la version originale à gauche, la saisie à
 * droite, champ par champ.
 *
 * Un champ laissé vide affiche la VO — la traduction se fait en plusieurs fois,
 * et rien n'oblige à tout écrire d'un coup pour enregistrer.
 */
export default function NewsTranslationEditor({
  newsId,
  lang,
  originalLang,
  original,
  initial,
  hasExisting,
  importGameId,
}: {
  newsId: string;
  lang: Locale;
  originalLang: Locale;
  original: Texts;
  initial: Texts;
  hasExisting: boolean;
  /** Jeu rattaché, pour la détection des noms de cartes à l'import. */
  importGameId?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Texts>(initial);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const set = (field: keyof Texts) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const translatedCount = (["title", "summary", "content"] as const).filter((field) =>
    values[field].trim()
  ).length;

  /**
   * Le site officiel publie souvent le même article dans chaque langue : son
   * adresse dans la langue visée donne la traduction telle quelle, mise en page
   * et images comprises. C'est la même boîte de dialogue que la rédaction, dont
   * seuls les trois textes sont repris ici — bannière et source appartiennent à
   * l'actualité, pas à l'une de ses langues.
   */
  const applyImport = (draft: ImportedNewsDraft) => {
    setValues({ title: draft.title, summary: draft.summary, content: draft.content });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/news/${newsId}/translations/${lang}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: values.title.trim(),
          summary: values.summary.trim(),
          content: values.content.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "L'enregistrement de la traduction a échoué");
        return;
      }

      // Vider les trois champs retire la langue : son adresse n'existe alors
      // plus, et y renvoyer donnerait un 404 juste après un enregistrement
      // réussi. On revient à la VO, la seule page qui reste.
      if (data.removed) {
        toast.success(`Traduction en ${localeLabels[lang]} retirée : tous les champs étaient vides`);
        router.push(`/news/${newsId}`);
      } else {
        toast.success(`Traduction en ${localeLabels[lang]} enregistrée`);
        router.push(`/news/${newsId}/${lang}`);
      }
      router.refresh();
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/news/${newsId}/translations/${lang}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "La suppression de la traduction a échoué");
        return;
      }

      toast.success(`Traduction en ${localeLabels[lang]} supprimée`);
      router.push(`/news/${newsId}`);
      router.refresh();
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed p-3">
        <p className="text-sm text-muted-foreground">
          {translatedCount}/3 champs traduits. Un champ laissé vide affiche la version originale (
          {localeLabels[originalLang]}).
        </p>
        <NewsImportDialog
          gameId={importGameId}
          hasContent={(["title", "summary", "content"] as const).some((field) => !!values[field].trim())}
          onImported={applyImport}
          triggerLabel={`Importer la version ${localeLabels[lang]}`}
          description={`Collez l'adresse du même article en ${localeLabels[lang]} sur le site d'origine. Seuls le titre, le résumé et le contenu sont repris : la bannière et la source appartiennent à l'actualité, pas à l'une de ses langues.`}
        />
      </div>

      {/* Titre */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Titre — {localeLabels[originalLang]}</Label>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{original.title}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="translated-title">Titre — {localeLabels[lang]}</Label>
          <Input
            id="translated-title"
            value={values.title}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="Laisser vide pour garder la version originale"
            maxLength={200}
          />
        </div>
      </div>

      {/* Résumé */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Résumé — {localeLabels[originalLang]}</Label>
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">
            {original.summary}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="translated-summary">Résumé — {localeLabels[lang]}</Label>
          <Textarea
            id="translated-summary"
            value={values.summary}
            onChange={(e) => set("summary")(e.target.value)}
            placeholder="Laisser vide pour garder la version originale"
            rows={4}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground text-right">{values.summary.length}/500</p>
        </div>
      </div>

      {/* Contenu */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-muted-foreground">Contenu — {localeLabels[originalLang]}</Label>
          {/*
            La VO est montrée en markdown brut, pas rendue : c'est ce texte-là
            qu'on traduit, crochets de cartes et syntaxe compris, et c'est en le
            voyant tel quel qu'on les reporte.
          */}
          <Textarea
            value={original.content}
            readOnly
            rows={20}
            className="field-sizing-fixed font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label>Contenu — {localeLabels[lang]}</Label>
          <MarkdownEditor
            value={values.content}
            onChange={set("content")}
            placeholder="Laisser vide pour garder la version originale"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 pt-2">
        <Button type="button" onClick={save} disabled={saving || deleting}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Enregistrer la traduction
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push(`/news/${newsId}`)} disabled={saving || deleting}>
          Annuler
        </Button>
        {hasExisting && (
          <Button type="button" variant="destructive" onClick={remove} disabled={saving || deleting}>
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Supprimer cette traduction
          </Button>
        )}
      </div>
    </div>
  );
}
