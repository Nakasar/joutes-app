"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type { PublicMetaImportRow } from "@/lib/db/meta-decks.ts";
import { cn } from "@/lib/utils.ts";
import { importMetaDecksAction, previewMetaImportAction, removeMetaBatchAction } from "./actions.ts";

const NO_FORMAT = "none";

const STATUS: Record<PublicMetaImportRow["status"], { label: string; className: string }> = {
  ready: { label: "Prêt", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  warning: { label: "À vérifier", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  duplicate: { label: "Doublon", className: "bg-muted text-muted-foreground" },
  error: { label: "Erreur", className: "bg-destructive/15 text-destructive" },
};

function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Le collage, sa vérification, puis l'import.
 *
 * Rien ne s'écrit avant « Importer » : la vérification lit chaque deck et dit
 * ce qui partira. Modifier le collage ou la source après coup efface la
 * vérification, pour qu'on n'importe jamais autre chose que ce qu'on a vu.
 */
export function MetaImportForm({
  gameId,
  gameName,
  formats,
  decksHref,
}: {
  gameId: string;
  gameName: string;
  formats: string[];
  decksHref: string;
}) {
  const router = useRouter();
  const [source, setSource] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [format, setFormat] = useState(formats[0] ?? NO_FORMAT);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<PublicMetaImportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, startChecking] = useTransition();
  const [importing, startImporting] = useTransition();

  const values = useMemo(
    () => ({ gameId, input, source, eventDate, format: format === NO_FORMAT ? undefined : format }),
    [gameId, input, source, eventDate, format]
  );

  const counts = useMemo(() => {
    const result = { ready: 0, warning: 0, duplicate: 0, error: 0 };
    for (const row of rows ?? []) result[row.status] += 1;
    return result;
  }, [rows]);
  const importable = counts.ready + counts.warning;

  // Toute modification du collage ou de la source rend la vérification caduque.
  const edit = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setRows(null);
    setError(null);
  };

  const check = () =>
    startChecking(async () => {
      setError(null);
      const result = await previewMetaImportAction(values);
      if (!result.ok) {
        setError(result.error);
        setRows(null);
        return;
      }
      setRows(result.rows);
      if (result.rows.length === 0) setError("Rien à importer : aucun lien, code ni liste reconnu.");
    });

  const runImport = () =>
    startImporting(async () => {
      const result = await importMetaDecksAction({ ...values, expected: importable });
      if (!result.ok) {
        // L'import a relu autre chose que la vérification : on montre ce qu'il a lu.
        if ("rows" in result) setRows(result.rows);
        setError(result.error);
        toast.error(result.error);
        return;
      }
      setRows(null);
      setInput("");
      router.refresh();
      toast.success(`${result.created} deck${result.created > 1 ? "s" : ""} importé${result.created > 1 ? "s" : ""}.`, {
        action: {
          label: "Annuler",
          onClick: async () => {
            const undo = await removeMetaBatchAction(result.batchId);
            if (undo.ok) {
              toast.success(`Import annulé : ${undo.deleted} deck${undo.deleted > 1 ? "s" : ""} supprimé${undo.deleted > 1 ? "s" : ""}.`);
              router.refresh();
            } else {
              toast.error(undo.error);
            }
          },
        },
      });
    });

  const deckCount = useMemo(() => {
    // Une estimation pour le bouton, avant vérification : une ligne de lien ou
    // de code = un deck, un bloc --- = un deck.
    const lines = input.split(/\r?\n/).map((line) => line.trim());
    const links = lines.filter((line) => /^https?:\/\//i.test(line) || /^[A-Z2-7]{16,}(\s|$)/.test(line)).length;
    const blocks = Math.ceil(lines.filter((line) => /^-{3,}$/.test(line)).length / 2);
    return links + blocks;
  }, [input]);

  return (
    <div className="flex flex-col gap-6">
      <section className="grid grid-cols-1 gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-3">
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="meta-source">Source</Label>
          <Input
            id="meta-source"
            value={source}
            onChange={(event) => edit(setSource)(event.target.value)}
            placeholder="Regional Lyon"
            maxLength={80}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-date">Date du tournoi</Label>
          <Input id="meta-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-format">Format</Label>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger id="meta-format" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_FORMAT}>Non précisé</SelectItem>
              {formats.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <Label htmlFor="meta-input">Decks à importer · {gameName}</Label>
            <span className="text-xs text-muted-foreground">
              un lien ou un code Piltover Archive par ligne · une liste écrite entre deux lignes « --- »
            </span>
          </div>
          <Textarea
            id="meta-input"
            value={input}
            onChange={(event) => edit(setInput)(event.target.value)}
            rows={9}
            spellCheck={false}
            className="font-mono text-[13px] leading-relaxed"
            placeholder={[
              "https://piltoverarchive.com/decks/view/… #1 @Pseudo",
              "CMAAAAAGAQAQCAYEBYCQ… #3-4",
              "---",
              "# Top 8",
              "Legend:",
              "1 Viktor, Herald of the Arcane",
              "Main Deck:",
              "3 Cloth Armor",
              "---",
            ].join("\n")}
          />
          <span className="text-xs text-muted-foreground">
            Après un lien ou un code, « #1 » donne le classement et « @Pseudo » le joueur ; pour une liste, sur une ligne à
            part, avant ses cartes.
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 sm:col-span-2 lg:col-span-3">
          {error && <p className="mr-auto text-sm text-destructive">{error}</p>}
          <Button type="button" variant="outline" onClick={check} disabled={checking || !input.trim() || !source.trim()}>
            {checking && <Loader2 className="animate-spin" aria-hidden />}
            {deckCount > 1 ? `Vérifier les ${deckCount} decks` : "Vérifier"}
          </Button>
        </div>
      </section>

      {rows && rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="text-base font-semibold">Vérification</h2>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {(Object.keys(STATUS) as PublicMetaImportRow["status"][])
                .filter((status) => counts[status] > 0)
                .map((status) => (
                  <span key={status} className={cn("rounded-full px-2.5 py-0.5", STATUS[status].className)}>
                    {counts[status]} {STATUS[status].label.toLowerCase()}
                  </span>
                ))}
            </div>
          </div>

          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.index} className="flex gap-3 px-4 py-3 sm:px-5">
                {row.legend?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.legend.image} alt="" className="h-14 w-10 shrink-0 rounded object-cover" loading="lazy" />
                ) : (
                  <div className="h-14 w-10 shrink-0 rounded bg-muted" aria-hidden />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">{row.name ?? row.label}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS[row.status].className)}>
                      {STATUS[row.status].label}
                    </span>
                    <span className="ml-auto font-mono text-xs text-muted-foreground">ligne {row.line}</span>
                  </div>
                  {row.legend && (
                    <span className="text-xs text-muted-foreground">
                      {row.legend.name}
                      {row.domains.length > 0 && ` · ${row.domains.join(" / ")}`}
                      {row.pilot && ` · ${row.pilot}`}
                      {row.placement && ` · ${row.placement}`}
                    </span>
                  )}
                  {row.zones.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs">
                      {row.zones
                        .filter((zone) => zone.count > 0 || !zone.compliant)
                        .map((zone) => (
                          <span key={zone.key} className={zone.compliant ? "text-muted-foreground" : "text-amber-700 dark:text-amber-300"}>
                            {zone.label} {zone.count}
                          </span>
                        ))}
                    </div>
                  )}
                  <span className="truncate font-mono text-[11px] text-muted-foreground">{row.label}</span>
                  {row.notes.map((note) => (
                    <span
                      key={note}
                      className={cn(
                        "text-xs",
                        row.status === "error" ? "text-destructive" : row.status === "warning" ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"
                      )}
                    >
                      {note}
                    </span>
                  ))}
                  {row.duplicateOf && "deckId" in row.duplicateOf && (
                    <Link href={`/decks/${row.duplicateOf.deckId}`} className="text-xs text-primary hover:underline">
                      Voir le deck déjà importé
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
            <p className="text-sm text-muted-foreground">
              Publiés en decks publics, étiquetés « Méta · {source.trim()} ». Doublons et erreurs sont laissés de côté.
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="ghost" className="flex-1 sm:flex-none" onClick={() => setRows(null)}>
                Annuler
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={runImport} disabled={importing || importable === 0}>
                {importing && <Loader2 className="animate-spin" aria-hidden />}
                {importable > 1 ? `Importer ${importable} decks` : importable === 1 ? "Importer 1 deck" : "Rien à importer"}
              </Button>
            </div>
          </div>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Les decks importés se retrouvent dans l&apos;onglet{" "}
        <Link href={decksHref} className="text-primary hover:underline">
          Decks méta
        </Link>
        , d&apos;où l&apos;on peut les retirer. Le deck public d&apos;un joueur se marque depuis sa fiche.
      </p>
    </div>
  );
}
