"use client";

import { useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { AlertTriangle, CheckCircle2, FlaskConical, Plus, RefreshCw, X, XCircle } from "lucide-react";
import { EventSource, Lair, LairEventsRefreshReport } from "@/lib/types/Lair.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  EventSourcePreview,
  previewLairEventSource,
  refreshEvents,
  updateLairEventSources,
} from "../actions.ts";

const FIELD_CLASS =
  "w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:border-transparent";

/** Les champs d'un événement, tels que la correspondance JSON les nomme. */
const MAPPED_FIELDS = [
  "id",
  "name",
  "startDateTime",
  "endDateTime",
  "gameName",
  "price",
  "status",
  "url",
] as const;

function emptyMapping(source: EventSource) {
  return source.mappingConfig ?? { eventsPath: "", eventsFieldsMapping: {} };
}

/**
 * Une source en cours de saisie, et la clé qui la suit.
 *
 * Les sources n'ont pas d'identifiant en base — c'est un tableau, et il le
 * reste. Mais leur rang ne fait pas une clé React : retirer la première ferait
 * hériter la deuxième du DOM de la première, et le curseur d'un champ en train
 * d'être saisi resterait sur place, à écrire dans une autre source que celle
 * qu'on éditait. La clé vit donc le temps du formulaire, et ne part pas au
 * serveur.
 */
type SourceDraft = { key: string; source: EventSource };

/** Ce que le bouton « Tester » d'une source a rendu, ou est en train de rendre. */
type PreviewState =
  | { status: "loading" }
  | { status: "failed"; error: string }
  | { status: "done"; preview: EventSourcePreview };

function formatDateTime(iso: string): string {
  const date = DateTime.fromISO(iso, { zone: "Europe/Paris" }).setLocale("fr");
  return date.isValid ? date.toFormat("ccc d LLL yyyy, HH:mm") : iso;
}

function formatRelative(iso: string): string {
  const date = DateTime.fromISO(iso).setLocale("fr");
  return date.isValid ? (date.toRelative() ?? date.toFormat("d LLL yyyy HH:mm")) : iso;
}

/**
 * Sources d'événements d'un lieu.
 *
 * C'est le formulaire qui ne tenait pas dans la modale : une source en
 * correspondance décrit huit champs, plus autant de valeurs par défaut, et les
 * deux tableaux se lisent ensemble — l'un dit où prendre la valeur, l'autre ce
 * qui la remplace. Empilés dans une boîte de 42 rem, il fallait faire défiler
 * de l'un à l'autre pour les comparer ; côte à côte, ils se lisent d'un coup.
 *
 * Chaque source se **teste** avant d'être enregistrée : le bouton lit la page
 * ou le JSON tel qu'il est saisi et montre les événements qu'il en tire, avec
 * ce qu'il n'a pas compris. C'est là qu'une correspondance se met au point,
 * pas en attendant le cron du mercredi.
 */
export function LairEventSourcesForm({
  lair,
  report: initialReport,
}: {
  lair: Lair;
  report: LairEventsRefreshReport | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [refreshing, startRefreshing] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [report, setReport] = useState(initialReport);
  const [drafts, setDrafts] = useState<SourceDraft[]>(() =>
    (lair.eventsSourceUrls ?? []).map((source, index) => ({ key: `source-${index}`, source })),
  );
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  // Les clés des sources ajoutées ici : un compteur, pour qu'aucune ne reprenne
  // celle d'une source retirée.
  const nextKey = useRef(0);

  const patch = (key: string, next: EventSource) => {
    setDrafts((previous) =>
      previous.map((draft) => (draft.key === key ? { ...draft, source: next } : draft)),
    );
    // Un aperçu décrit la source telle qu'elle était : il ne vaut plus rien.
    setPreviews((previous) => {
      if (!(key in previous)) return previous;
      const rest = { ...previous };
      delete rest[key];
      return rest;
    });
  };

  const patchMapping = (
    key: string,
    source: EventSource,
    next: Partial<NonNullable<EventSource["mappingConfig"]>>,
  ) => {
    patch(key, { ...source, mappingConfig: { ...emptyMapping(source), ...next } });
  };

  const submit = () => {
    setMessage(null);

    startTransition(async () => {
      const result = await updateLairEventSources(
        lair.id,
        drafts.map((draft) => draft.source).filter((source) => source.url.trim() !== ""),
      );

      setMessage(
        result.success
          ? { ok: true, text: "Sources enregistrées." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  const refresh = () => {
    setMessage(null);

    startRefreshing(async () => {
      const result = await refreshEvents(lair.id);

      if (result.report) setReport(result.report);
      setMessage(
        result.success
          ? { ok: true, text: result.message || "Événements rafraîchis." }
          : { ok: false, text: result.error ?? "Erreur lors du rafraîchissement" },
      );
    });
  };

  const preview = async (key: string, source: EventSource) => {
    setPreviews((previous) => ({ ...previous, [key]: { status: "loading" } }));

    const result = await previewLairEventSource(lair.id, source);

    setPreviews((previous) => ({
      ...previous,
      [key]: result.success
        ? { status: "done", preview: result.preview }
        : { status: "failed", error: result.error },
    }));
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-foreground"
              : "border-destructive/30 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      )}

      {lair.isPrivate && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Ce lieu est privé : il ne peut pas moissonner d&apos;événements. Ses sources doivent
          rester vides.
        </div>
      )}

      <RefreshReportCard report={report} />

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sources d&apos;événements</h2>
            <p className="text-sm text-muted-foreground">
              D&apos;où viennent les événements du lieu. Une source lue par l&apos;IA n&apos;a
              besoin que d&apos;une URL ; une source en correspondance décrit un JSON champ par
              champ. Testez une source pour voir ce qu&apos;elle rend avant de l&apos;enregistrer.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {drafts.length > 0 && (
              <Button type="button" variant="outline" onClick={refresh} disabled={refreshing}>
                <RefreshCw className="size-4" aria-hidden />
                {refreshing ? "Rafraîchissement…" : "Rafraîchir"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDrafts([
                  ...drafts,
                  {
                    key: `ajoutee-${(nextKey.current += 1)}`,
                    source: { url: "", type: "IA", instructions: "" },
                  },
                ])
              }
            >
              <Plus className="size-4" aria-hidden />
              Ajouter une source
            </Button>
          </div>
        </div>

        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune source : les événements de ce lieu ne peuvent être saisis qu&apos;à la main.
          </p>
        ) : (
          <div className="space-y-4">
            {drafts.map(({ key, source }, index) => (
              <div key={key} className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">Source #{index + 1}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={source.type === "IA" ? "default" : "outline"}
                        onClick={() =>
                          patch(key, {
                            url: source.url,
                            type: "IA",
                            instructions: source.instructions ?? "",
                          })
                        }
                      >
                        IA
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={source.type === "MAPPING" ? "default" : "outline"}
                        onClick={() =>
                          patch(key, {
                            url: source.url,
                            type: "MAPPING",
                            mappingConfig: emptyMapping(source),
                          })
                        }
                      >
                        Correspondance
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDrafts(drafts.filter((draft) => draft.key !== key))}
                      aria-label={`Retirer la source ${index + 1}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`source-url-${key}`}
                    className="block text-xs font-medium text-muted-foreground mb-1"
                  >
                    URL de la source
                  </label>
                  <input
                    id={`source-url-${key}`}
                    type="url"
                    value={source.url}
                    onChange={(e) => patch(key, { ...source, url: e.target.value })}
                    placeholder="https://exemple.com/evenements"
                    className={`${FIELD_CLASS} font-mono`}
                  />
                </div>

                {source.type === "IA" && (
                  <div>
                    <label
                      htmlFor={`source-instructions-${key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Consignes pour l&apos;IA (optionnel)
                    </label>
                    <textarea
                      id={`source-instructions-${key}`}
                      rows={3}
                      value={source.instructions ?? ""}
                      onChange={(e) => patch(key, { ...source, instructions: e.target.value })}
                      placeholder="Ce que la page a de particulier : où sont les dates, quels blocs ignorer…"
                      className={FIELD_CLASS}
                    />
                  </div>
                )}

                {source.type === "MAPPING" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`source-path-${key}`}
                          className="block text-xs font-medium text-muted-foreground mb-1"
                        >
                          Chemin vers les événements
                        </label>
                        <input
                          id={`source-path-${key}`}
                          type="text"
                          value={source.mappingConfig?.eventsPath ?? ""}
                          onChange={(e) =>
                            patchMapping(key, source, { eventsPath: e.target.value })
                          }
                          placeholder="data.events — ou $ si le JSON est la liste"
                          className={`${FIELD_CLASS} font-mono`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`source-base-${key}`}
                          className="block text-xs font-medium text-muted-foreground mb-1"
                        >
                          Préfixe de base d&apos;URL (optionnel)
                        </label>
                        <input
                          id={`source-base-${key}`}
                          type="text"
                          value={source.mappingConfig?.eventsBaseUrl ?? ""}
                          onChange={(e) =>
                            patchMapping(key, source, { eventsBaseUrl: e.target.value })
                          }
                          placeholder="https://joutes.app/events/"
                          className={`${FIELD_CLASS} font-mono`}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Collé devant le champ <span className="font-mono">id</span> quand
                          l&apos;événement n&apos;a pas d&apos;URL.
                        </p>
                      </div>
                    </div>

                    {/* Les deux tableaux côte à côte : l'un dit où prendre la
                        valeur, l'autre ce qui la remplace. C'est ce que la
                        modale ne pouvait pas montrer d'un seul regard. */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-foreground mb-3">
                          Correspondance des champs
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {MAPPED_FIELDS.map((field) => (
                            <div key={field}>
                              <label
                                htmlFor={`map-${field}-${key}`}
                                className="block font-mono text-xs text-muted-foreground mb-1"
                              >
                                {field}
                              </label>
                              <input
                                id={`map-${field}-${key}`}
                                type="text"
                                value={source.mappingConfig?.eventsFieldsMapping?.[field] ?? ""}
                                onChange={(e) =>
                                  patchMapping(key, source, {
                                    eventsFieldsMapping: {
                                      ...source.mappingConfig?.eventsFieldsMapping,
                                      [field]: e.target.value,
                                    },
                                  })
                                }
                                placeholder={field}
                                className={`${FIELD_CLASS} font-mono`}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Le champ <span className="font-mono">id</span> est ce qui permet de
                          retrouver un événement d&apos;un rafraîchissement à l&apos;autre :
                          renseignez-le dès que le JSON en donne un.
                        </p>
                      </div>

                      <div>
                        <p className="text-sm font-medium text-foreground mb-3">
                          Valeurs par défaut
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          {(["name", "gameName", "startDateTime", "endDateTime"] as const).map(
                            (field) => (
                              <div key={field}>
                                <label
                                  htmlFor={`value-${field}-${key}`}
                                  className="block font-mono text-xs text-muted-foreground mb-1"
                                >
                                  {field}
                                </label>
                                <input
                                  id={`value-${field}-${key}`}
                                  type="text"
                                  value={source.mappingConfig?.eventsFieldsValues?.[field] ?? ""}
                                  onChange={(e) =>
                                    patchMapping(key, source, {
                                      eventsFieldsValues: {
                                        ...source.mappingConfig?.eventsFieldsValues,
                                        [field]: e.target.value || undefined,
                                      },
                                    })
                                  }
                                  className={FIELD_CLASS}
                                />
                              </div>
                            ),
                          )}

                          <div>
                            <label
                              htmlFor={`value-price-${key}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              price
                            </label>
                            <input
                              id={`value-price-${key}`}
                              type="number"
                              step="0.01"
                              value={source.mappingConfig?.eventsFieldsValues?.price ?? ""}
                              onChange={(e) =>
                                patchMapping(key, source, {
                                  eventsFieldsValues: {
                                    ...source.mappingConfig?.eventsFieldsValues,
                                    price: e.target.value
                                      ? Number.parseFloat(e.target.value)
                                      : undefined,
                                  },
                                })
                              }
                              className={FIELD_CLASS}
                            />
                          </div>

                          <div>
                            <label
                              htmlFor={`value-status-${key}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              status
                            </label>
                            <select
                              id={`value-status-${key}`}
                              value={source.mappingConfig?.eventsFieldsValues?.status ?? ""}
                              onChange={(e) =>
                                patchMapping(key, source, {
                                  eventsFieldsValues: {
                                    ...source.mappingConfig?.eventsFieldsValues,
                                    status: e.target.value
                                      ? (e.target.value as "available" | "sold-out" | "cancelled")
                                      : undefined,
                                  },
                                })
                              }
                              className={FIELD_CLASS}
                            >
                              <option value="">-- Aucun --</option>
                              <option value="available">available</option>
                              <option value="sold-out">sold-out</option>
                              <option value="cancelled">cancelled</option>
                            </select>
                          </div>

                          <div className="col-span-2">
                            <label
                              htmlFor={`value-url-${key}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              url
                            </label>
                            <input
                              id={`value-url-${key}`}
                              type="text"
                              value={source.mappingConfig?.eventsFieldsValues?.url ?? ""}
                              onChange={(e) =>
                                patchMapping(key, source, {
                                  eventsFieldsValues: {
                                    ...source.mappingConfig?.eventsFieldsValues,
                                    url: e.target.value || undefined,
                                  },
                                })
                              }
                              className={FIELD_CLASS}
                            />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-3">
                          Ces valeurs remplacent celles issues de la correspondance.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => preview(key, source)}
                    disabled={source.url.trim() === "" || previews[key]?.status === "loading"}
                  >
                    <FlaskConical className="size-4" aria-hidden />
                    {previews[key]?.status === "loading" ? "Lecture…" : "Tester la source"}
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    Lit la source telle qu&apos;elle est saisie, sans rien enregistrer.
                  </span>
                </div>

                {previews[key] && <PreviewPanel state={previews[key]} />}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les sources"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Une source sans URL est abandonnée à l&apos;enregistrement.
        </span>
      </div>
    </div>
  );
}

/** Ce que le dernier rafraîchissement, du cron ou du bouton, a donné. */
function RefreshReportCard({ report }: { report: LairEventsRefreshReport | null }) {
  if (!report) return null;

  const failing = report.sources.filter((source) => !source.ok);

  return (
    <section className="bg-card rounded-lg shadow-md p-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dernier rafraîchissement</h2>
          <p className="text-sm text-muted-foreground">
            {formatRelative(report.at)} — {report.inserted} nouveaux, {report.updated} mis à jour,{" "}
            {report.unchanged} inchangés, {report.cancelled} annulés, {report.removed} retirés.
          </p>
        </div>
        {failing.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <XCircle className="size-4" aria-hidden />
            {failing.length} source{failing.length > 1 ? "s" : ""} en échec
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" aria-hidden />
            Toutes les sources ont répondu
          </span>
        )}
      </div>

      <ul className="space-y-2">
        {report.sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {source.ok ? (
                <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              ) : (
                <XCircle className="size-4 shrink-0 text-destructive" aria-hidden />
              )}
              <span className="font-mono text-xs break-all">{source.url}</span>
              <span className="text-muted-foreground">
                {source.ok
                  ? `${source.count} événement${source.count > 1 ? "s" : ""}`
                  : `échec — ${source.error ?? "raison inconnue"} ; ses événements sont laissés en l'état`}
              </span>
            </div>
            {source.warnings.length > 0 && <WarningsList warnings={source.warnings} />}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarningsList({ warnings }: { warnings: string[] }) {
  return (
    <ul className="mt-1 ml-6 space-y-0.5">
      {warnings.map((warning) => (
        <li key={warning} className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>{warning}</span>
        </li>
      ))}
    </ul>
  );
}

/** Le résultat du test d'une source : ses événements, et ce qui a coincé. */
function PreviewPanel({ state }: { state: PreviewState }) {
  if (state.status === "loading") {
    return <p className="text-sm text-muted-foreground">Lecture de la source…</p>;
  }

  if (state.status === "failed") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        {state.error}
      </div>
    );
  }

  const { preview } = state;

  if (!preview.ok) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        La source n&apos;a pas pu être lue : {preview.error ?? "raison inconnue"}.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-background p-3 space-y-3">
      <p className="text-sm text-foreground">
        {preview.events.length === 0
          ? "La source a été lue, mais aucun événement n'en ressort."
          : `${preview.events.length} événement${preview.events.length > 1 ? "s" : ""} lu${preview.events.length > 1 ? "s" : ""}.`}
      </p>

      {preview.warnings.length > 0 && <WarningsList warnings={preview.warnings} />}

      {preview.events.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 pr-3 font-medium">Nom</th>
                <th className="py-1 pr-3 font-medium">Début</th>
                <th className="py-1 pr-3 font-medium">Fin</th>
                <th className="py-1 pr-3 font-medium">Jeu</th>
                <th className="py-1 pr-3 font-medium">Prix</th>
                <th className="py-1 pr-3 font-medium">Statut</th>
                <th className="py-1 pr-3 font-medium">Lien</th>
                <th className="py-1 font-medium">Id</th>
              </tr>
            </thead>
            <tbody>
              {preview.events.map((event, index) => (
                <tr key={`${event.name}-${event.startDateTime}-${index}`} className="border-t border-border align-top">
                  <td className="py-1 pr-3 text-foreground">{event.name}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(event.startDateTime)}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">{formatDateTime(event.endDateTime)}</td>
                  <td className="py-1 pr-3">{event.gameName}</td>
                  <td className="py-1 pr-3 whitespace-nowrap">
                    {event.price === undefined ? "—" : `${event.price} €`}
                  </td>
                  <td className="py-1 pr-3">{event.status}</td>
                  <td className="py-1 pr-3 max-w-[16rem] truncate">
                    {event.url ? (
                      <a href={event.url} target="_blank" rel="noreferrer" className="underline">
                        {event.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 font-mono">{event.externalId ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
