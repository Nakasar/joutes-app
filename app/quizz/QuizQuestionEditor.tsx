"use client";

import { nanoid } from "nanoid";
import { QuizQuestion, QuizQuestionType } from "@/lib/types/Quiz";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";

const QUESTION_TYPE_LABELS: Record<QuizQuestionType, string> = {
  single: "Choix unique",
  multiple: "Choix multiples",
  text: "Réponse texte",
  number: "Réponse numérique",
};

export default function QuizQuestionEditor({
  question,
  onChange,
  onRemove,
}: {
  question: QuizQuestion;
  onChange: (question: QuizQuestion) => void;
  onRemove: () => void;
}) {
  const changeType = (type: QuizQuestionType) => {
    if (type === "single" || type === "multiple") {
      onChange({
        ...question,
        type,
        options: question.options ?? [
          { id: nanoid(), text: "" },
          { id: nanoid(), text: "" },
        ],
        correctOptionIds: question.correctOptionIds ?? [],
      });
    } else {
      onChange({ ...question, type });
    }
  };

  const addOption = () => {
    onChange({ ...question, options: [...(question.options ?? []), { id: nanoid(), text: "" }] });
  };

  const updateOptionText = (optionId: string, text: string) => {
    onChange({
      ...question,
      options: (question.options ?? []).map((option) => (option.id === optionId ? { ...option, text } : option)),
    });
  };

  const removeOption = (optionId: string) => {
    onChange({
      ...question,
      options: (question.options ?? []).filter((option) => option.id !== optionId),
      correctOptionIds: (question.correctOptionIds ?? []).filter((id) => id !== optionId),
    });
  };

  const toggleCorrectOption = (optionId: string) => {
    const current = question.correctOptionIds ?? [];
    if (question.type === "single") {
      onChange({ ...question, correctOptionIds: [optionId] });
    } else {
      onChange({
        ...question,
        correctOptionIds: current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId],
      });
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Label>Question</Label>
          <Textarea
            value={question.prompt}
            onChange={(e) => onChange({ ...question, prompt: e.target.value })}
            placeholder="Énoncé de la question (Markdown supporté)"
            rows={2}
          />
        </div>
        <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="shrink-0 text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Type de réponse</Label>
        <Select value={question.type} onValueChange={(value) => changeType(value as QuizQuestionType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(QUESTION_TYPE_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(question.type === "single" || question.type === "multiple") && (
        <div className="space-y-2">
          <Label>Réponses possibles (cochez la ou les bonnes réponses)</Label>
          <div className="space-y-2">
            {(question.options ?? []).map((option) => (
              <div key={option.id} className="flex items-center gap-2">
                <Checkbox
                  checked={(question.correctOptionIds ?? []).includes(option.id)}
                  onCheckedChange={() => toggleCorrectOption(option.id)}
                />
                <Input
                  value={option.text}
                  onChange={(e) => updateOptionText(option.id, e.target.value)}
                  placeholder="Texte de la réponse"
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(option.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addOption}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Ajouter une réponse
          </Button>
        </div>
      )}

      {question.type === "text" && (
        <div className="space-y-2">
          <Label>Bonne réponse (texte)</Label>
          <Input
            value={question.correctText ?? ""}
            onChange={(e) => onChange({ ...question, correctText: e.target.value })}
            placeholder="Réponse attendue (comparaison insensible à la casse)"
          />
        </div>
      )}

      {question.type === "number" && (
        <div className="space-y-2">
          <Label>Bonne réponse (nombre)</Label>
          <Input
            type="number"
            value={question.correctNumber ?? ""}
            onChange={(e) =>
              onChange({ ...question, correctNumber: e.target.value === "" ? undefined : Number(e.target.value) })
            }
            placeholder="Valeur attendue"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Message si bonne réponse</Label>
          <Textarea
            value={question.correctFeedback ?? ""}
            onChange={(e) => onChange({ ...question, correctFeedback: e.target.value })}
            placeholder="Affiché après validation en cas de bonne réponse (Markdown supporté)"
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label>Message si mauvaise réponse</Label>
          <Textarea
            value={question.incorrectFeedback ?? ""}
            onChange={(e) => onChange({ ...question, incorrectFeedback: e.target.value })}
            placeholder="Affiché après validation en cas de mauvaise réponse (Markdown supporté)"
            rows={2}
          />
        </div>
      </div>
    </div>
  );
}
