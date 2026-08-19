"use client";

import { useState } from "react";
import { nanoid } from "nanoid";
import { useRouter } from "@/i18n/navigation.ts";
import { Game } from "@/lib/types/Game.ts";
import { Quiz, QuizBlock } from "@/lib/types/Quiz.ts";
import { locales, localeLabels, type Locale } from "@/i18n/config.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import QuizBlockEditor from "./QuizBlockEditor.tsx";
import QuizImportDialog from "./QuizImportDialog.tsx";
import { toast } from "sonner";
import { Loader2, FileText, ListChecks } from "lucide-react";

/** `canImport` : droit `quizzes:ai-import`, distinct de celui d'éditer un quizz. */
type QuizFormProps = { canImport: boolean } & (
  | { mode: "create"; games: Game[]; defaultLang: Locale }
  | { mode: "edit"; quiz: Quiz; games: Game[] }
);

type FormData = {
  title: string;
  gameId: string;
  /** Langue dans laquelle le quizz est écrit : la « VO » dont partent les traductions. */
  originalLang: Locale;
  blocks: QuizBlock[];
};

export default function QuizForm(props: QuizFormProps) {
  const router = useRouter();
  const isEdit = props.mode === "edit";

  const [form, setForm] = useState<FormData>({
    title: isEdit ? props.quiz.title : "",
    gameId: isEdit ? props.quiz.gameId ?? "" : "",
    originalLang: isEdit ? props.quiz.originalLang : props.defaultLang,
    blocks: isEdit ? props.quiz.blocks : [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addMarkdownBlock = () => {
    setForm((prev) => ({ ...prev, blocks: [...prev.blocks, { id: nanoid(), type: "markdown", content: "" }] }));
  };

  const addFormBlock = () => {
    setForm((prev) => ({
      ...prev,
      blocks: [...prev.blocks, { id: nanoid(), type: "form", questions: [], showSubmitButton: true }],
    }));
  };

  /**
   * Brouillon issu d'un texte : ses blocs s'ajoutent à la suite de ceux déjà
   * saisis, et le titre proposé n'est repris que si aucun n'a été donné — un
   * import ne doit pas écraser un travail en cours.
   */
  const applyImport = (draft: { title: string; blocks: QuizBlock[] }) => {
    setForm((prev) => ({
      ...prev,
      title: prev.title.trim() ? prev.title : draft.title,
      blocks: [...prev.blocks, ...draft.blocks],
    }));
  };

  const updateBlock = (blockId: string, block: QuizBlock) => {
    setForm((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === blockId ? block : b)) }));
  };

  const removeBlock = (blockId: string) => {
    setForm((prev) => ({ ...prev, blocks: prev.blocks.filter((b) => b.id !== blockId) }));
  };

  const moveBlock = (blockId: string, direction: -1 | 1) => {
    setForm((prev) => {
      const index = prev.blocks.findIndex((b) => b.id === blockId);
      const targetIndex = index + direction;
      if (index === -1 || targetIndex < 0 || targetIndex >= prev.blocks.length) return prev;
      const blocks = [...prev.blocks];
      [blocks[index], blocks[targetIndex]] = [blocks[targetIndex], blocks[index]];
      return { ...prev, blocks };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    if (form.blocks.length === 0) {
      toast.error("Le quizz doit contenir au moins un bloc");
      return;
    }
    for (const block of form.blocks) {
      if (block.type === "markdown" && !block.content.trim()) {
        toast.error("Un bloc de texte est vide");
        return;
      }
      if (block.type === "form") {
        if (block.questions.length === 0) {
          toast.error("Un bloc formulaire doit contenir au moins une question");
          return;
        }
        for (const question of block.questions) {
          if (!question.prompt.trim()) {
            toast.error("Une question est vide");
            return;
          }
          if ((question.type === "single" || question.type === "multiple") && (question.correctOptionIds ?? []).length === 0) {
            toast.error(`Aucune bonne réponse définie pour la question « ${question.prompt} »`);
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      const url = isEdit ? `/api/quizzes/${props.quiz.id}` : "/api/quizzes";
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

      const saved: Quiz = await res.json();
      toast.success(isEdit ? "Quizz mis à jour" : "Quizz publié");
      router.push(`/quizz/${saved.id}`);
    } catch {
      toast.error("Une erreur réseau est survenue");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="title">Titre *</Label>
        <Input
          id="title"
          value={form.title}
          onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
          placeholder="Titre du quizz"
          maxLength={200}
        />
      </div>

      <div className="space-y-2">
        <Label>Jeu rattaché</Label>
        <Select
          value={form.gameId || "none"}
          onValueChange={(value) => setForm((prev) => ({ ...prev, gameId: value === "none" ? "" : value }))}
        >
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Aucun jeu</SelectItem>
            {props.games.map((game) => (
              <SelectItem key={game.id} value={game.id}>
                {game.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Langue d&apos;origine</Label>
        <Select
          value={form.originalLang}
          onValueChange={(value) => setForm((prev) => ({ ...prev, originalLang: value as Locale }))}
        >
          <SelectTrigger className="sm:max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {locales.map((lang) => (
              <SelectItem key={lang} value={lang}>
                {localeLabels[lang]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          La langue dans laquelle vous écrivez le quizz. Les traductions en partent, et elle sert de repli
          quand un texte n&apos;est pas traduit.
        </p>
      </div>

      <div className="space-y-3">
        <Label>Contenu du quizz *</Label>
        {form.blocks.map((block, index) => (
          <QuizBlockEditor
            key={block.id}
            block={block}
            index={index}
            isFirst={index === 0}
            isLast={index === form.blocks.length - 1}
            onChange={(b) => updateBlock(block.id, b)}
            onRemove={() => removeBlock(block.id)}
            onMoveUp={() => moveBlock(block.id, -1)}
            onMoveDown={() => moveBlock(block.id, 1)}
          />
        ))}

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={addMarkdownBlock}>
            <FileText className="h-4 w-4 mr-2" />
            Ajouter un bloc de texte
          </Button>
          <Button type="button" variant="outline" onClick={addFormBlock}>
            <ListChecks className="h-4 w-4 mr-2" />
            Ajouter un bloc formulaire
          </Button>
          {props.canImport && (
            <QuizImportDialog gameId={form.gameId} onImported={applyImport} />
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {isEdit ? "Enregistrer les modifications" : "Publier le quizz"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
