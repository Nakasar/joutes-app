"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PackCard } from "./PackEditor";

type ImportMode = "append" | "replace";

type ImportResult = {
  imported: number;
  /** Lignes dont la carte n'existe pas dans la base du jeu. */
  unresolved: string[];
  /** Lignes que le format ne couvre pas. */
  invalidLines: string[];
  cards: PackCard[];
};

type Props = {
  cubeId: string;
  packId: string;
  onImported: (cards: PackCard[]) => void;
};

/**
 * Import d'une liste de cartes dans un paquet. Les lignes non reconnues sont
 * affichées à la fin de l'import plutôt que de l'annuler : une liste vient
 * souvent d'un autre outil, et une carte inconnue ne doit pas coûter tout le
 * reste.
 */
export default function ImportPackDialog({ cubeId, packId, onImported }: Props) {
  const t = useTranslations("Cubes");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<ImportMode>("append");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setText("");
      setResult(null);
      setError(null);
    }
  };

  const submit = async () => {
    if (!text.trim()) {
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/cubes/${cubeId}/packs/${packId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? t("import.error"));
        return;
      }

      const imported: ImportResult = data;
      onImported(imported.cards);
      toast.success(t("import.success", { count: imported.imported }));

      // Le dialogue reste ouvert tant qu'il a quelque chose à signaler : les
      // lignes ignorées sont la seule trace de ce qui n'est pas entré.
      if (imported.unresolved.length === 0 && imported.invalidLines.length === 0) {
        handleOpenChange(false);
        return;
      }
      setResult(imported);
      setText("");
    } catch {
      setError(t("import.error"));
    } finally {
      setImporting(false);
    }
  };

  const rejected = result ? [...result.unresolved, ...result.invalidLines] : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="size-4" />
          {t("import.trigger")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("import.title")}</DialogTitle>
          <DialogDescription>{t("import.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-muted-foreground">
            {t("import.example")}
          </pre>

          <div className="space-y-1">
            <Label htmlFor="pack-import-text">{t("import.list")}</Label>
            <Textarea
              id="pack-import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder={t("import.placeholder")}
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label>{t("import.mode")}</Label>
            <Select value={mode} onValueChange={(value) => setMode(value as ImportMode)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="append">{t("import.modeAppend")}</SelectItem>
                <SelectItem value="replace">{t("import.modeReplace")}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`import.${mode}Hint`)}</p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          {result && rejected.length > 0 ? (
            <div className="space-y-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm font-medium">{t("import.rejected", { count: rejected.length })}</p>
              <ul className="max-h-40 space-y-0.5 overflow-y-auto font-mono text-xs text-muted-foreground">
                {rejected.map((line, index) => (
                  <li key={`${line}-${index}`} className="truncate" title={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={submit} disabled={importing || !text.trim()} className="gap-2">
            {importing ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("import.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
