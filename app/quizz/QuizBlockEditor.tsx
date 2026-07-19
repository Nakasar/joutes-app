"use client";

import { nanoid } from "nanoid";
import { QuizBlock, QuizQuestion } from "@/lib/types/Quiz";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import MarkdownEditor from "@/components/MarkdownEditor";
import QuizQuestionEditor from "./QuizQuestionEditor";
import { ArrowUp, ArrowDown, Trash2, Plus, FileText, ListChecks } from "lucide-react";

function newQuestion(): QuizQuestion {
  return { id: nanoid(), type: "single", prompt: "", options: [{ id: nanoid(), text: "" }, { id: nanoid(), text: "" }], correctOptionIds: [] };
}

export default function QuizBlockEditor({
  block,
  index,
  isFirst,
  isLast,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  block: QuizBlock;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onChange: (block: QuizBlock) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const addQuestion = () => {
    if (block.type !== "form") return;
    onChange({ ...block, questions: [...block.questions, newQuestion()] });
  };

  const updateQuestion = (questionId: string, question: QuizQuestion) => {
    if (block.type !== "form") return;
    onChange({ ...block, questions: block.questions.map((q) => (q.id === questionId ? question : q)) });
  };

  const removeQuestion = (questionId: string) => {
    if (block.type !== "form") return;
    onChange({ ...block, questions: block.questions.filter((q) => q.id !== questionId) });
  };

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          {block.type === "markdown" ? <FileText className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
          Bloc {index + 1} — {block.type === "markdown" ? "Texte" : "Formulaire"}
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" size="icon" onClick={onMoveUp} disabled={isFirst}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onMoveDown} disabled={isLast}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {block.type === "markdown" ? (
        <MarkdownEditor
          value={block.content}
          onChange={(content) => onChange({ ...block, content })}
          placeholder="Texte affiché dans le quizz (Markdown supporté)"
          rows={8}
        />
      ) : (
        <div className="space-y-3">
          {block.questions.map((question) => (
            <QuizQuestionEditor
              key={question.id}
              question={question}
              onChange={(q) => updateQuestion(question.id, q)}
              onRemove={() => removeQuestion(question.id)}
            />
          ))}

          <Button type="button" variant="outline" size="sm" onClick={addQuestion}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ajouter une question
          </Button>

          <label className="flex items-center gap-2 pt-2 cursor-pointer">
            <Checkbox
              checked={block.showSubmitButton}
              onCheckedChange={(checked) => onChange({ ...block, showSubmitButton: !!checked })}
            />
            <Label className="cursor-pointer">
              Ajouter un bouton de validation (vérifie les réponses de ce bloc et des précédents)
            </Label>
          </label>
        </div>
      )}
    </div>
  );
}
