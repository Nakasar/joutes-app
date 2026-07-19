"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Eye, Pencil } from "lucide-react";
import ReactMarkdown from "react-markdown";

type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
};

export default function MarkdownEditor({ value, onChange, placeholder, rows = 16 }: MarkdownEditorProps) {
  const [mode, setMode] = useState<"write" | "preview">("write");

  return (
    <div className="space-y-2">
      <div className="flex gap-2 border-b pb-2">
        <Button
          type="button"
          variant={mode === "write" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("write")}
        >
          <Pencil className="h-3.5 w-3.5 mr-1" />
          Écrire
        </Button>
        <Button
          type="button"
          variant={mode === "preview" ? "default" : "ghost"}
          size="sm"
          onClick={() => setMode("preview")}
        >
          <Eye className="h-3.5 w-3.5 mr-1" />
          Aperçu
        </Button>
      </div>

      {mode === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "Rédigez votre contenu en Markdown…"}
          rows={rows}
          className="font-mono text-sm resize-y"
        />
      ) : (
        <div
          className="min-h-[200px] rounded-md border px-3 py-2 prose prose-sm dark:prose-invert max-w-none"
          style={{ minHeight: `${rows * 1.5}rem` }}
        >
          {value ? (
            <ReactMarkdown>{value}</ReactMarkdown>
          ) : (
            <p className="text-muted-foreground italic">Aucun contenu à prévisualiser.</p>
          )}
        </div>
      )}
    </div>
  );
}
