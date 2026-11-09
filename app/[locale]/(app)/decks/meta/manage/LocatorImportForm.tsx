"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import type { PublicMetaImportRow } from "@/lib/db/meta-decks.ts";
import { formatPlacement } from "@/lib/meta/import-input.ts";
import { LOCATOR_BATCH_SIZE, type LocatorEvent, type LocatorStanding } from "@/lib/meta/locator.ts";
import { tournamentPath } from "@/lib/meta/tournaments.ts";
import { cn } from "@/lib/utils.ts";
import {
  importLocatorDecksAction,
  previewLocatorDecksAction,
  readLocatorEventAction,
  removeMetaBatchAction,
} from "./actions.ts";

const NO_FORMAT = "none";
const RANGES = [8, 16, 32, 64] as const;
/** Lignes de l'aperçu montrées avant « Tout afficher ». */
const PREVIEW_ROWS = 12;

type RowState = "ready" | "warning" | "duplicate" | "error" | "absent" | "loading";

const STATE: Record<RowState, { label: string; className: string }> = {
  ready: { label: "Prêt", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  warning: { label: "À vérifier", className: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  duplicate: { label: "Déjà importé", className: "bg-muted text-muted-foreground" },
  error: { label: "Erreur", className: "bg-destructive/15 text-destructive" },
  absent: { label: "Liste absente", className: "bg-muted text-muted-foreground" },
  loading: { label: "Lecture…", className: "bg-primary/10 text-primary" },
};

type PreviewRow = {
  standing: LocatorStanding;
  state: RowState;
  row?: PublicMetaImportRow;
  notes: string[];
};

type Progress = {
  total: number;
  done: number;
  created: number;
  batchId?: string;
  /** Les decks que le locator n'a pas rendus à l'import, à relancer. */
  failed: { standing: LocatorStanding; note: string }[];
  finished: boolean;
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function formatDay(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

function placeLabel(standing: LocatorStanding): string {
  return standing.place ? (formatPlacement(String(standing.place)) ?? "") : "–";
}

function deckPayload(standing: LocatorStanding) {
  return {
    deckId: standing.deckId as string,
    ...(standing.place ? { place: standing.place } : {}),
    player: standing.player,
    ...(standing.legend ? { legend: standing.legend } : {}),
  };
}

/**
 * Import d'un tournoi du locator Riftbound : on colle le lien de
 * l'évènement, on choisit la tranche du classement, on vérifie l'aperçu, puis
 * les decks s'importent par lots, avec leur progression.
 */
export function LocatorImportForm({
  gameId,
  gameKey,
  formats,
  decksHref,
}: {
  gameId: string;
  gameKey: string;
  formats: string[];
  decksHref: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [event, setEvent] = useState<LocatorEvent | null>(null);
  const [standings, setStandings] = useState<LocatorStanding[]>([]);
  const [source, setSource] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [format, setFormat] = useState(formats[0] ?? NO_FORMAT);
  const [range, setRange] = useState<number | "all">(32);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [reading, startReading] = useTransition();
  const [checking, setChecking] = useState(false);
  // Un aperçu relancé rend caduc celui en cours : seul le dernier écrit ses résultats.
  const previewRun = useRef(0);

  const reset = () => {
    previewRun.current += 1;
    setEvent(null);
    setStandings([]);
    setPreview(null);
    setProgress(null);
    setSelected(new Set());
    setError(null);
    setUrl("");
  };

  const readEvent = () =>
    startReading(async () => {
      setError(null);
      setPreview(null);
      setProgress(null);
      const result = await readLocatorEventAction({ gameId, url });
      if (!result.ok) {
        setEvent(null);
        setError(result.error);
        return;
      }
      setEvent(result.event);
      setStandings(result.standings);
      setSource(result.event.name.slice(0, 80));
      setEventDate(result.event.date);
      const matching = formats.find((name) => name.toLowerCase() === result.event.format?.toLowerCase());
      if (matching) setFormat(matching);
      const initial = result.standings.length > 32 ? 32 : "all";
      setRange(initial);
      void loadPreview(result.event, result.standings, initial, result.event.name.slice(0, 80));
    });

  const picked = (list: LocatorStanding[], value: number | "all") =>
    value === "all" ? list : list.filter((standing, index) => (standing.place ?? index + 1) <= value);

  const loadPreview = async (current: LocatorEvent, list: LocatorStanding[], value: number | "all", name: string) => {
    const run = ++previewRun.current;
    const rows: PreviewRow[] = picked(list, value).map((standing) => ({
      standing,
      state: standing.deckId ? "loading" : "absent",
      notes: standing.deckId ? [] : ["Le joueur n'a pas publié sa liste."],
    }));
    setPreview(rows);
    setSelected(new Set());
    setShowAll(false);
    if (!name.trim()) return;

    setChecking(true);
    const withDeck = rows.filter((row) => row.standing.deckId);
    for (const batch of chunk(withDeck, LOCATOR_BATCH_SIZE)) {
      const result = await previewLocatorDecksAction({
        gameId,
        eventId: current.id,
        source: name,
        decks: batch.map((row) => deckPayload(row.standing)),
      });
      if (run !== previewRun.current) return;
      setPreview((previous) => {
        if (!previous) return previous;
        return previous.map((row) => {
          const index = batch.findIndex((candidate) => candidate.standing.deckId === row.standing.deckId);
          if (index < 0) return row;
          if (!result.ok) return { ...row, state: "error", notes: [result.error] };
          const read = result.rows[index];
          return { ...row, state: read.status, row: read, notes: read.notes };
        });
      });
      if (result.ok) {
        setSelected((previous) => {
          const next = new Set(previous);
          result.rows.forEach((read, index) => {
            if (read.status === "ready") next.add(batch[index].standing.deckId as string);
          });
          return next;
        });
      }
    }
    if (run === previewRun.current) setChecking(false);
  };

  const chooseRange = (value: number | "all") => {
    setRange(value);
    if (event) void loadPreview(event, standings, value, source);
  };

  const counts = useMemo(() => {
    const result: Record<RowState, number> = { ready: 0, warning: 0, duplicate: 0, error: 0, absent: 0, loading: 0 };
    for (const row of preview ?? []) result[row.state] += 1;
    return result;
  }, [preview]);

  const toImport = (preview ?? []).filter(
    (row) => row.standing.deckId && selected.has(row.standing.deckId) && (row.state === "ready" || row.state === "warning")
  );

  const runImport = async (targets: LocatorStanding[], previous?: Progress) => {
    if (!event) return;
    const state: Progress = previous
      ? { ...previous, total: previous.total, finished: false, failed: previous.failed.filter((item) => !targets.includes(item.standing)) }
      : { total: targets.length, done: 0, created: 0, failed: [], finished: false };
    setProgress({ ...state });

    for (const batch of chunk(targets, LOCATOR_BATCH_SIZE)) {
      const result = await importLocatorDecksAction({
        gameId,
        eventId: event.id,
        source,
        eventDate,
        format: format === NO_FORMAT ? undefined : format,
        decks: batch.map(deckPayload),
        ...(state.batchId ? { batchId: state.batchId } : {}),
      });
      if (!result.ok) {
        state.failed.push(...batch.map((standing) => ({ standing, note: result.error })));
      } else {
        state.batchId = result.batchId;
        state.created += result.created;
        result.rows.forEach((row, index) => {
          if (row.status === "error") state.failed.push({ standing: batch[index], note: row.notes[0] ?? "Deck illisible." });
        });
      }
      state.done = Math.min(state.total, state.done + (previous ? 0 : batch.length));
      setProgress({ ...state, failed: [...state.failed] });
    }

    state.finished = true;
    state.done = state.total;
    setProgress({ ...state, failed: [...state.failed] });
    router.refresh();
  };

  const startImport = () => {
    setError(null);
    void runImport(toImport.map((row) => row.standing));
  };

  const undo = async () => {
    if (!progress?.batchId) return;
    const result = await removeMetaBatchAction(progress.batchId);
    if (result.ok) {
      toast.success(`Import annulé : ${plural(result.deleted, "deck supprimé", "decks supprimés")}.`);
      setProgress(null);
      if (event) void loadPreview(event, standings, range, source);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const allCount = standings.length;
  const visible = showAll ? (preview ?? []) : (preview ?? []).slice(0, PREVIEW_ROWS);
  const hidden = (preview?.length ?? 0) - visible.length;
  const selectable = (preview ?? []).filter((row) => row.state === "ready" || row.state === "warning");
  const allChecked = selectable.length > 0 && selectable.every((row) => selected.has(row.standing.deckId as string));

  const toggle = (deckId: string, on: boolean) =>
    setSelected((previous) => {
      const next = new Set(previous);
      if (on) next.add(deckId);
      else next.delete(deckId);
      return next;
    });

  const rangeLabel = range === "all" ? `tous les ${allCount} joueurs` : `Top ${range}`;
  const metaPath = `/games/${encodeURIComponent(gameKey)}/meta`;

  if (progress) {
    const leftAside = (preview?.length ?? 0) - progress.total;
    const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 100;
    return (
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
        {!progress.finished ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">Import en cours · {source}</h2>
              <span className="text-sm tabular-nums text-muted-foreground">
                {progress.done} sur {plural(progress.total, "deck")}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Avancement de l'import"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="h-3 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-sm text-muted-foreground">
              Lecture des listes sur le locator par lots de {LOCATOR_BATCH_SIZE}, puis création des decks. Ce qui est déjà
              importé le reste, et relancer l&apos;import ne crée pas de doublon.
            </p>
          </>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">Import terminé · {source}</span>
            <h2 className="text-xl font-bold">{plural(progress.created, "deck importé", "decks importés")}</h2>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className={cn("rounded-full px-2.5 py-0.5", STATE.ready.className)}>{progress.created} importés</span>
              {progress.failed.length > 0 && (
                <span className={cn("rounded-full px-2.5 py-0.5", STATE.warning.className)}>{progress.failed.length} en échec</span>
              )}
              {leftAside > 0 && (
                <span className={cn("rounded-full px-2.5 py-0.5", STATE.absent.className)}>{leftAside} laissés de côté</span>
              )}
            </div>
            {progress.failed.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {progress.failed.map(({ standing, note }) => (
                  <li key={standing.deckId}>
                    {placeLabel(standing)} · {standing.player} : {note}
                  </li>
                ))}
                <li>
                  <Button variant="link" className="h-auto p-0" onClick={() => void runImport(progress.failed.map((item) => item.standing), progress)}>
                    Réessayer {progress.failed.length > 1 ? `les ${progress.failed.length} decks` : "ce deck"}
                  </Button>
                </li>
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {progress.created > 0 && (
                <Button asChild>
                  <Link href={tournamentPath(metaPath, source, eventDate)}>Voir la page du tournoi</Link>
                </Button>
              )}
              {progress.created > 0 && (
                <Button asChild variant="outline">
                  <Link href={`${decksHref}&source=${encodeURIComponent(source)}`}>Voir les decks importés</Link>
                </Button>
              )}
              <Button variant="ghost" onClick={reset}>
                Importer un autre tournoi
              </Button>
              {progress.batchId && progress.created > 0 && (
                <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void undo()}>
                  Annuler cet import
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 sm:p-6">
        <Label htmlFor="locator-url">Lien de l&apos;évènement sur le locator</Label>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(submit) => {
            submit.preventDefault();
            readEvent();
          }}
        >
          <Input
            id="locator-url"
            value={url}
            onChange={(change) => setUrl(change.target.value)}
            placeholder="https://locator.riftbound.uvsgames.com/events/1227032"
            inputMode="url"
            spellCheck={false}
            className="font-mono text-[13px]"
          />
          <Button type="submit" disabled={reading || !url.trim()}>
            {reading && <Loader2 className="animate-spin" aria-hidden />}
            Lire le tournoi
          </Button>
        </form>
        <span className="text-xs text-muted-foreground">
          Un lien ou un simple numéro d&apos;évènement. Les decklists doivent être publiées sur le locator.
        </span>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </section>

      {event && (
        <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted-foreground">Évènement trouvé</span>
              <h2 className="text-lg font-bold">
                <a href={event.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {event.name}
                </a>
              </h2>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {event.date && <span>{formatDay(event.date)}</span>}
                {event.address && <span>{event.address}</span>}
                <span>{plural(event.playerCount || allCount, "joueur")}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className={cn("rounded-full px-2.5 py-0.5", event.finished ? STATE.ready.className : STATE.warning.className)}>
                {event.finished ? "Terminé" : "Pas encore terminé"}
              </span>
              <span className={cn("rounded-full px-2.5 py-0.5", event.decklistsPublished ? STATE.ready.className : STATE.warning.className)}>
                {event.decklistsPublished ? "Decklists publiées" : "Decklists non publiées"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="locator-source">Nom du tournoi dans Joutes</Label>
              <Input
                id="locator-source"
                value={source}
                maxLength={80}
                onChange={(change) => {
                  setSource(change.target.value);
                  // Le nom entre dans le nom des decks et la recherche des doublons : l'aperçu est à refaire.
                  previewRun.current += 1;
                  setChecking(false);
                  setPreview(null);
                }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="locator-date">Date</Label>
              <Input id="locator-date" type="date" value={eventDate} onChange={(change) => setEventDate(change.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="locator-format">Format</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger id="locator-format" className="w-full">
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-medium">Decks à importer</span>
            {RANGES.filter((value) => value < allCount).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant="outline"
                aria-pressed={range === value}
                className={cn("rounded-full", range === value && "border-primary bg-primary/10 text-primary hover:bg-primary/15")}
                onClick={() => chooseRange(value)}
              >
                Top {value}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={range === "all"}
              className={cn("rounded-full", range === "all" && "border-primary bg-primary/10 text-primary hover:bg-primary/15")}
              onClick={() => chooseRange("all")}
            >
              Tous ({allCount})
            </Button>
            {!preview && source.trim() && (
              <Button type="button" size="sm" onClick={() => chooseRange(range)}>
                Relire l&apos;aperçu
              </Button>
            )}
          </div>
        </section>
      )}

      {event && preview && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              Aperçu · {rangeLabel}
              {checking && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Lecture des decks" />}
            </h2>
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {(Object.keys(STATE) as RowState[])
                .filter((state) => counts[state] > 0)
                .map((state) => (
                  <span key={state} className={cn("rounded-full px-2.5 py-0.5", STATE[state].className)}>
                    {counts[state]} {STATE[state].label.toLowerCase()}
                  </span>
                ))}
            </div>
          </div>
          <p className="border-b border-border px-4 py-2 text-xs text-muted-foreground sm:px-5">
            La légende vient du classement du locator. Le champion choisi et les champs de bataille n&apos;y sont pas publiés :
            le champion est repris quand une seule version de lui reste dans le deck, sinon il reste vide, comme les champs
            de bataille.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="hidden text-left text-xs text-muted-foreground sm:table-header-group">
                <tr className="border-b border-border">
                  <th scope="col" className="w-10 px-4 py-2 sm:px-5">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={allChecked}
                      disabled={selectable.length === 0}
                      aria-label="Tout cocher"
                      onChange={(change) =>
                        setSelected(change.target.checked ? new Set(selectable.map((row) => row.standing.deckId as string)) : new Set())
                      }
                    />
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">Place</th>
                  <th scope="col" className="px-2 py-2 font-medium">Joueur</th>
                  <th scope="col" className="px-2 py-2 font-medium">Bilan</th>
                  <th scope="col" className="px-2 py-2 font-medium">Légende</th>
                  <th scope="col" className="px-2 py-2 font-medium">Nom du deck</th>
                  <th scope="col" className="px-2 py-2 pr-4 font-medium sm:pr-5">État</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((item) => {
                  const deckId = item.standing.deckId;
                  const canPick = item.state === "ready" || item.state === "warning";
                  return (
                    <tr
                      key={deckId ?? `${item.standing.player}-${item.standing.place}`}
                      className={cn(
                        "grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-3 gap-y-1 px-4 py-3 sm:table-row sm:p-0",
                        !canPick && "bg-muted/30"
                      )}
                    >
                      <td className="row-span-3 self-start sm:px-5 sm:py-2.5 sm:align-middle">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={Boolean(deckId && selected.has(deckId))}
                          disabled={!canPick}
                          aria-label={`Importer le deck de ${item.standing.player}`}
                          onChange={(change) => deckId && toggle(deckId, change.target.checked)}
                        />
                      </td>
                      <td className="font-bold tabular-nums sm:px-2 sm:py-2.5">{placeLabel(item.standing)}</td>
                      <td className="min-w-0 truncate font-medium sm:px-2 sm:py-2.5">{item.standing.player}</td>
                      <td className="whitespace-nowrap tabular-nums text-muted-foreground sm:px-2 sm:py-2.5">{item.standing.record}</td>
                      <td className="col-span-3 col-start-2 sm:px-2 sm:py-2.5">
                        {item.row?.legend ? (
                          <span className="flex items-center gap-2">
                            {item.row.legend.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={item.row.legend.image} alt="" className="h-9 w-6 shrink-0 rounded object-cover object-top" loading="lazy" />
                            ) : (
                              <span className="h-9 w-6 shrink-0 rounded bg-muted" aria-hidden />
                            )}
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{item.row.legend.name.split(",")[0]}</span>
                              {item.row.domains.length > 0 && (
                                <span className="truncate text-xs text-muted-foreground">{item.row.domains.join(" · ")}</span>
                              )}
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{item.standing.legend?.split(",")[0] ?? (item.state === "loading" ? "…" : "—")}</span>
                        )}
                      </td>
                      <td className="col-span-3 col-start-2 min-w-0 text-muted-foreground sm:px-2 sm:py-2.5 sm:text-foreground">
                        {item.row?.name}
                      </td>
                      <td className="col-span-3 col-start-2 sm:px-2 sm:py-2.5 sm:pr-5">
                        <span className="flex flex-col items-start gap-0.5">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", STATE[item.state].className)}>
                            {STATE[item.state].label}
                          </span>
                          {item.notes.map((note) => (
                            <span key={note} className="text-xs text-muted-foreground">
                              {note}
                            </span>
                          ))}
                          {item.row?.duplicateOf && "deckId" in item.row.duplicateOf && (
                            <Link href={`/decks/${item.row.duplicateOf.deckId}`} className="text-xs text-primary hover:underline">
                              Voir le deck
                            </Link>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {hidden > 0 && (
            <div className="border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
              … et {plural(hidden, "autre deck", "autres decks")}.{" "}
              <Button variant="link" className="h-auto p-0" onClick={() => setShowAll(true)}>
                Tout afficher
              </Button>
            </div>
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-3 sm:px-5">
            <p className="text-sm text-muted-foreground">
              Publiés en decks publics, étiquetés « Méta · {source.trim()} ». Les lignes décochées, déjà importées ou sans
              liste sont laissées de côté.
            </p>
            <div className="flex w-full gap-2 sm:w-auto">
              <Button variant="ghost" className="flex-1 sm:flex-none" onClick={reset}>
                Annuler
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={startImport}
                disabled={checking || toImport.length === 0 || !source.trim() || !eventDate}
              >
                {toImport.length > 1 ? `Importer ${toImport.length} decks` : toImport.length === 1 ? "Importer 1 deck" : "Rien à importer"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
