"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localeLabels, type Locale } from "@/i18n/config";
import type { Quiz, QuizTranslationEntry } from "@/lib/types/Quiz";
import {
  collectTranslatableSections,
  mergeTranslationEntries,
  translationProgress,
  type QuizFieldKind,
  type QuizTranslatableField,
} from "@/lib/quizzes/translate";

/** Ce qu'annonce chaque ligne, et la hauteur de saisie qui lui convient. */
const FIELD_LABELS: Record<QuizFieldKind, string> = {
  blockContent: "Texte du bloc",
  prompt: "Énoncé",
  option: "Réponse possible",
  correctText: "Réponse attendue",
  correctFeedback: "Explication si bonne réponse",
  incorrectFeedback: "Explication si mauvaise réponse",
};

const LONG_FIELDS: QuizFieldKind[] = ["blockContent", "correctFeedback", "incorrectFeedback"];

function fieldLabel(field: QuizTranslatableField): string {
  const label = FIELD_LABELS[field.kind];
  return field.kind === "option" ? `${label} ${(field.optionIndex ?? 0) + 1}` : label;
}

/** Clé de saisie : un même identifiant porte plusieurs champs (énoncé, explications…). */
function keyOf(field: QuizTranslatableField): string {
  return `${field.id}:${field.entryField}`;
}

export default function QuizTranslationEditor({
  quiz,
  lang,
  initialTitle,
  initialEntries,
}: {
  quiz: Quiz;
  lang: Locale;
  initialTitle: string;
  initialEntries: Record<string, QuizTranslationEntry>;
}) {
  const router = useRouter();
  const sections = useMemo(() => collectTranslatableSections(quiz.blocks), [quiz.blocks]);

  const [title, setTitle] = useState(initialTitle);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      sections.flatMap((section) =>
        section.fields.map((field) => [keyOf(field), initialEntries[field.id]?.[field.entryField] ?? ""])
      )
    )
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /**
   * Les valeurs saisies, posées sur les entrées déjà enregistrées. L'éditeur ne
   * montre que les textes du quizz actuel : reconstruire la traduction à partir
   * du seul formulaire effacerait les entrées dont le bloc a été retiré, que le
   * modèle conserve justement pour le cas où il reviendrait.
   */
  const toEntries = (): Record<string, QuizTranslationEntry> =>
    mergeTranslationEntries(
      initialEntries,
      sections.flatMap((section) =>
        section.fields.map((field) => ({
          id: field.id,
          entryField: field.entryField,
          value: values[keyOf(field)] ?? "",
        }))
      )
    );

  const progress = translationProgress(quiz.blocks, toEntries());

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quizzes/${quiz.id}/translations/${lang}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), entries: toEntries() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "L'enregistrement a échoué");
        return;
      }
      toast.success(`Traduction ${localeLabels[lang]} enregistrée`);
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
      const res = await fetch(`/api/quizzes/${quiz.id}/translations/${lang}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "La suppression a échoué");
        return;
      }
      toast.success(`Traduction ${localeLabels[lang]} supprimée`);
      router.push(`/quizz/${quiz.id}`);
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {progress.done}/{progress.total}
          </span>{" "}
          textes traduits.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={remove} disabled={saving || deleting}>
            {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Supprimer la traduction
          </Button>
          <Button type="button" onClick={save} disabled={saving || deleting}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enregistrer
          </Button>
        </div>
      </div>

      {/* Les colonnes se superposent sur petit écran : la source reste au-dessus
          de la saisie qu'elle nourrit. */}
      <div className="hidden md:grid grid-cols-2 gap-4 px-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{localeLabels[quiz.originalLang]} · version originale</span>
        <span>{localeLabels[lang]}</span>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-2">
        <Label htmlFor="translation-title">Titre</Label>
        <div className="grid gap-3 md:grid-cols-2">
          <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{quiz.title}</p>
          <Input
            id="translation-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={quiz.title}
            maxLength={200}
          />
        </div>
      </div>

      {sections.map((section) => (
        <div
          key={`${section.blockIndex}-${section.questionIndex ?? "block"}`}
          className="rounded-lg border bg-card p-4 space-y-4"
        >
          <p className="text-sm font-semibold">
            Bloc {section.blockIndex + 1}
            {section.questionIndex !== undefined ? ` — Question ${section.questionIndex + 1}` : " — Texte"}
          </p>

          {section.fields.map((field) => {
            const key = keyOf(field);
            const isLong = LONG_FIELDS.includes(field.kind);

            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`t-${key}`} className="text-xs text-muted-foreground">
                  {fieldLabel(field)}
                </Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <p className="whitespace-pre-wrap rounded-md border bg-muted/40 px-3 py-2 text-sm">
                    {field.source}
                  </p>
                  {isLong ? (
                    <Textarea
                      id={`t-${key}`}
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      rows={Math.min(12, Math.max(3, Math.ceil(field.source.length / 60)))}
                      placeholder="Non traduit — la version originale sera affichée"
                    />
                  ) : (
                    <Input
                      id={`t-${key}`}
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="Non traduit — la version originale sera affichée"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={saving || deleting}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
