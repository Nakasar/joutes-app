"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";

export type CollectionFormatOption = { id: string; label: string };

type ImportResponse = {
  added: number;
  rows: number;
  issues: { line: number; message: string }[];
};

/** Nombre de lignes en défaut détaillées ; au-delà, seul le total est annoncé. */
const LISTED_ISSUES = 5;

/**
 * Import et export de la collection d'un jeu, au format d'un outil tiers ou au
 * format Joutes. L'import **ajoute** les exemplaires lus : rien n'est remplacé,
 * importer deux fois le même fichier double la collection.
 */
export default function CollectionTransfer({
  gameSlug,
  formats,
  onImported,
}: {
  gameSlug: string;
  formats: CollectionFormatOption[];
  /** Appelé après un import réussi, pour recharger la page courante. */
  onImported: () => void;
}) {
  const t = useTranslations("Collection.transfer");

  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState(formats[0]?.id ?? "joutes");
  const [importFormat, setImportFormat] = useState(formats[0]?.id ?? "joutes");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/collection/games/${gameSlug}/export?format=${encodeURIComponent(exportFormat)}`,
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        toast.error(t("exportError"), { description: data.error });
        return;
      }

      // Le nom du fichier est décidé par le serveur : on le reprend de
      // l'en-tête plutôt que de le recalculer des deux côtés.
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${gameSlug}-collection.csv`;

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      // Le lien est posé dans le document avant le clic : certains navigateurs
      // ignorent un clic sur un élément détaché. La révocation est différée —
      // révoquer dans la foulée coupe un téléchargement qui n'a pas encore
      // démarré, et le fichier arrive vide.
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);

      setExportOpen(false);
    } catch (error) {
      console.error("Error exporting collection:", error);
      toast.error(t("exportError"));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;

    setBusy(true);
    try {
      const csv = await file.text();
      const response = await fetch(`/api/collection/games/${gameSlug}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: importFormat, csv }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(t("importError"), { description: data.error });
        return;
      }

      const result = data as ImportResponse;
      const description =
        result.issues.length > 0
          ? [
              t("importIssues", { count: result.issues.length }),
              ...result.issues
                .slice(0, LISTED_ISSUES)
                .map((issue) => t("importIssueLine", { line: issue.line, message: issue.message })),
            ].join("\n")
          : undefined;

      toast.success(t("importDone", { count: result.added }), { description });

      setImportOpen(false);
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
      onImported();
    } catch (error) {
      console.error("Error importing collection:", error);
      toast.error(t("importError"));
    } finally {
      setBusy(false);
    }
  };

  const formatSelect = (value: string, onChange: (next: string) => void, id: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("formatLabel")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {formats.map((format) => (
            <SelectItem key={format.id} value={format.id}>
              {format.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setExportOpen(true)}>
        <Download className="size-4" />
        {t("exportAction")}
      </Button>
      <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
        <Upload className="size-4" />
        {t("importAction")}
      </Button>

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("exportTitle")}</DialogTitle>
            <DialogDescription>{t("exportDescription")}</DialogDescription>
          </DialogHeader>

          {formatSelect(exportFormat, setExportFormat, "collection-export-format")}

          <Button onClick={handleExport} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {t("exportSubmit")}
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("importTitle")}</DialogTitle>
            <DialogDescription>{t("importDescription")}</DialogDescription>
          </DialogHeader>

          {formatSelect(importFormat, setImportFormat, "collection-import-format")}

          <div className="space-y-2">
            <Label htmlFor="collection-import-file">{t("fileLabel")}</Label>
            <input
              id="collection-import-file"
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:py-1.5 file:text-sm"
            />
          </div>

          <Button onClick={handleImport} disabled={busy || !file} className="gap-2">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("importSubmit")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
