"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Download, FileText, Loader2, Upload } from "lucide-react";
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
import { undoBatch } from "./undo-batch.ts";

export type CollectionFormatOption = { id: string; label: string };

type Candidate = { id: string; name: string; setCode: string; collectorNumber: string; rarity?: string };

type PreviewIssue = {
  line: number;
  message: string;
  label?: string;
  quantity?: number;
  candidates?: Candidate[];
};

type Preview = {
  rows: number;
  copies: number;
  issues: PreviewIssue[];
  currentCopies: number;
};

type ImportResponse = {
  added: number;
  rows: number;
  removed: number;
  issues: PreviewIssue[];
  batchId?: string;
};

/** Valeur du sélecteur d'une ligne ambiguë laissée de côté. */
const SKIP = "__skip";

/** Lignes en défaut montrées d'un coup : au-delà, le total suffit. */
const LISTED_ISSUES = 50;

/**
 * Le format d'un fichier, deviné à ses en-têtes : l'export de Piltover Archive
 * commence par « Variant Number ». Rien de deviné ne s'impose : le sélecteur
 * reste modifiable.
 */
function detectFormat(csv: string, formats: CollectionFormatOption[], fallback: string): string {
  const header = csv.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  if (/variant number/i.test(header) && formats.some((format) => format.id === "piltover-archive")) {
    return "piltover-archive";
  }
  if (/card id/i.test(header) && formats.some((format) => format.id === "joutes")) return "joutes";
  return fallback;
}

/**
 * Import et export de la collection d'un jeu, au format d'un outil tiers ou au
 * format Joutes.
 *
 * L'import se fait en deux temps : le fichier est d'abord lu sans rien écrire,
 * pour montrer ce qu'il contient et faire choisir la bonne carte quand une
 * ligne est ambiguë ; on décide ensuite d'ajouter ses exemplaires ou de
 * remplacer par eux ceux du jeu.
 */
export default function CollectionTransfer({
  gameSlug,
  formats,
  onImported,
  searchParams,
  searchText,
}: {
  gameSlug: string;
  formats: CollectionFormatOption[];
  /** Appelé après un import réussi (ou annulé), pour recharger la page courante. */
  onImported: () => void;
  /** La recherche affichée, telle que l'API la lit : de quoi n'exporter qu'elle. */
  searchParams?: string;
  /** La saisie de cette recherche, montrée à côté du choix. */
  searchText?: string;
}) {
  const t = useTranslations("Collection.transfer");

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"import" | "export">("import");
  const [busy, setBusy] = useState(false);

  const [exportFormat, setExportFormat] = useState(formats[0]?.id ?? "joutes");
  const [exportScope, setExportScope] = useState<"all" | "search" | "doubles">("all");

  const [importFormat, setImportFormat] = useState(formats[0]?.id ?? "joutes");
  const [file, setFile] = useState<File | null>(null);
  const [csv, setCsv] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"add" | "replace">("add");
  const fileInput = useRef<HTMLInputElement>(null);

  const hasSearch = Boolean(searchParams && searchText?.trim());
  // La recherche a pu être vidée après le choix : on n'exporte alors pas « tout » en douce sous l'étiquette « recherche ».
  const scope = exportScope === "search" && !hasSearch ? "all" : exportScope;

  const resetImport = () => {
    setFile(null);
    setCsv(null);
    setPreview(null);
    setChoices({});
    setMode("add");
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) resetImport();
  };

  const handleExport = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams(scope === "search" && searchParams ? searchParams : "");
      params.delete("page");
      params.delete("limit");
      params.delete("owned");
      params.set("format", exportFormat);
      params.set("scope", scope);
      const response = await fetch(`/api/collection/games/${gameSlug}/export?${params.toString()}`);
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

      setOpen(false);
    } catch (error) {
      console.error("Error exporting collection:", error);
      toast.error(t("exportError"));
    } finally {
      setBusy(false);
    }
  };

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/collection/games/${gameSlug}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "");
    return data;
  };

  const handleCheck = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const text = await file.text();
      setCsv(text);
      setPreview((await post({ format: importFormat, csv: text, dryRun: true })) as Preview);
      setChoices({});
    } catch (error) {
      toast.error(t("importError"), { description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const ambiguous = preview?.issues.filter((issue) => issue.candidates?.length) ?? [];
  const missing = preview?.issues.filter((issue) => !issue.candidates?.length) ?? [];
  const resolvedCopies = ambiguous.reduce(
    (total, issue) => total + (choices[String(issue.line)] && choices[String(issue.line)] !== SKIP ? issue.quantity ?? 0 : 0),
    0
  );
  const totalCopies = (preview?.copies ?? 0) + resolvedCopies;

  const handleImport = async () => {
    if (!csv || !preview) return;
    setBusy(true);
    try {
      const resolutions = Object.fromEntries(Object.entries(choices).filter(([, cardId]) => cardId !== SKIP));
      const result = (await post({ format: importFormat, csv, resolutions, mode })) as ImportResponse;

      const description =
        mode === "replace" ? t("import.replacedDetail", { removed: result.removed }) : undefined;
      const batchId = result.batchId;
      toast.success(t("importDone", { count: result.added }), {
        description,
        ...(batchId
          ? {
              action: {
                label: t("undo"),
                onClick: () => void undoBatch(batchId, (count) => t("undone", { count }), t("undoError")).then(onImported),
              },
            }
          : {}),
      });

      handleOpenChange(false);
      onImported();
    } catch (error) {
      toast.error(t("importError"), { description: error instanceof Error ? error.message : undefined });
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

  const option = (
    name: string,
    value: string,
    checked: boolean,
    onSelect: () => void,
    title: string,
    detail?: React.ReactNode
  ) => (
    <label
      key={value}
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm transition-colors ${
        checked ? "border-primary bg-primary/5" : "hover:bg-muted/40"
      }`}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} className="mt-0.5 accent-primary" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
      </span>
    </label>
  );

  return (
    <>
      <Button variant="outline" className="gap-2" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="size-4" />
        {t("action")}
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className={preview && tab === "import" ? "sm:max-w-3xl" : undefined}>
          <DialogHeader>
            <div className="inline-flex w-fit rounded-lg border bg-muted/40 p-0.5 text-sm" role="tablist">
              {(["import", "export"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                    tab === value ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {value === "import" ? t("importAction") : t("exportAction")}
                </button>
              ))}
            </div>
            <DialogTitle>{tab === "import" ? t("importTitle") : t("exportTitle")}</DialogTitle>
            <DialogDescription>
              {tab === "import" ? (preview ? t("import.checkDescription") : t("importDescription")) : t("exportDescription")}
            </DialogDescription>
          </DialogHeader>

          {tab === "export" ? (
            <div className="flex flex-col gap-4">
              {formatSelect(exportFormat, setExportFormat, "collection-export-format")}
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium">{t("export.scope")}</legend>
                {option("export-scope", "all", scope === "all", () => setExportScope("all"), t("export.all"))}
                {hasSearch
                  ? option(
                      "export-scope",
                      "search",
                      exportScope === "search",
                      () => setExportScope("search"),
                      t("export.search"),
                      <span className="font-mono">{searchText}</span>
                    )
                  : null}
                {option(
                  "export-scope",
                  "doubles",
                  exportScope === "doubles",
                  () => setExportScope("doubles"),
                  t("export.doubles"),
                  t("export.doublesDetail")
                )}
              </fieldset>
              {exportFormat === "piltover-archive" ? (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{t("export.piltoverLoss")}</p>
              ) : null}
              <Button onClick={handleExport} disabled={busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                {t("exportSubmit")}
              </Button>
            </div>
          ) : !preview ? (
            <div className="flex flex-col gap-4">
              <div className="space-y-2">
                <Label htmlFor="collection-import-file">{t("fileLabel")}</Label>
                <input
                  id="collection-import-file"
                  ref={fileInput}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const next = event.target.files?.[0] ?? null;
                    setFile(next);
                    if (next) setImportFormat(detectFormat(await next.slice(0, 2000).text(), formats, importFormat));
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm"
                />
              </div>
              {formatSelect(importFormat, setImportFormat, "collection-import-format")}
              <Button onClick={handleCheck} disabled={!file || busy} className="gap-2">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
                {t("import.check")}
              </Button>
            </div>
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex items-center gap-3 rounded-lg border p-3 text-sm">
                <FileText className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{file?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formats.find((format) => format.id === importFormat)?.label}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={resetImport}>
                  {t("import.changeFile")}
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xl font-bold text-emerald-500">{preview.rows}</p>
                  <p className="text-xs text-muted-foreground">{t("import.recognized", { copies: preview.copies })}</p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xl font-bold text-amber-500">{ambiguous.length}</p>
                  <p className="text-xs text-muted-foreground">{t("import.ambiguous")}</p>
                </div>
                <div className="rounded-lg bg-muted px-3 py-2">
                  <p className="text-xl font-bold text-destructive">{missing.length}</p>
                  <p className="text-xs text-muted-foreground">{t("import.missing")}</p>
                </div>
              </div>

              {preview.issues.length > 0 ? (
                <div className="max-h-72 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-semibold">{t("import.line")}</th>
                        <th className="px-3 py-2 font-semibold">{t("import.problem")}</th>
                        <th className="w-56 px-3 py-2 font-semibold">{t("import.chosen")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.issues.slice(0, LISTED_ISSUES).map((issue) => (
                        <tr key={issue.line} className="border-t align-top">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{issue.line}</td>
                          <td className="px-3 py-2">
                            {issue.label ? <p className="font-medium">{issue.label}</p> : null}
                            <p className="text-xs text-muted-foreground">{issue.message}</p>
                          </td>
                          <td className="px-3 py-2">
                            {issue.candidates?.length ? (
                              <Select
                                value={choices[String(issue.line)] ?? SKIP}
                                onValueChange={(value) => setChoices((current) => ({ ...current, [issue.line]: value }))}
                              >
                                <SelectTrigger className="h-8 w-full text-xs" aria-label={t("import.chooseFor", { line: issue.line })}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={SKIP}>{t("import.skip")}</SelectItem>
                                  {issue.candidates.map((candidate) => (
                                    <SelectItem key={candidate.id} value={candidate.id}>
                                      {candidate.setCode}-{candidate.collectorNumber}
                                      {candidate.rarity ? ` · ${candidate.rarity}` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-xs text-muted-foreground">{t("import.ignored")}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.issues.length > LISTED_ISSUES ? (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                      {t("import.moreIssues", { count: preview.issues.length - LISTED_ISSUES })}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <fieldset className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <legend className="mb-2 text-sm font-medium">
                  {t("import.current", { count: preview.currentCopies })}
                </legend>
                {option("import-mode", "add", mode === "add", () => setMode("add"), t("import.add"), t("import.addDetail"))}
                {option(
                  "import-mode",
                  "replace",
                  mode === "replace",
                  () => setMode("replace"),
                  t("import.replace"),
                  t("import.replaceDetail")
                )}
              </fieldset>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {mode === "replace"
                    ? t("import.replaceSummary", { removed: preview.currentCopies, added: totalCopies })
                    : t("import.addSummary", { added: totalCopies })}
                </p>
                <Button
                  onClick={handleImport}
                  disabled={busy || totalCopies === 0}
                  variant={mode === "replace" ? "destructive" : "default"}
                  className="gap-2"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  {mode === "replace"
                    ? t("import.replaceSubmit", { count: totalCopies })
                    : t("import.submit", { count: totalCopies })}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
