"use client";

import { useState, useTransition } from "react";
import { Plus, RefreshCw, X } from "lucide-react";
import { EventSource, Lair } from "@/lib/types/Lair.ts";
import { Button } from "@/components/ui/button.tsx";
import { refreshEvents, updateLairEventSources } from "../actions.ts";

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
 * Sources d'événements d'un lieu.
 *
 * C'est le formulaire qui ne tenait pas dans la modale : une source en
 * correspondance décrit huit champs, plus autant de valeurs par défaut, et les
 * deux tableaux se lisent ensemble — l'un dit où prendre la valeur, l'autre ce
 * qui la remplace. Empilés dans une boîte de 42 rem, il fallait faire défiler
 * de l'un à l'autre pour les comparer ; côte à côte, ils se lisent d'un coup.
 */
export function LairEventSourcesForm({ lair }: { lair: Lair }) {
  const [isPending, startTransition] = useTransition();
  const [refreshing, startRefreshing] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [sources, setSources] = useState<EventSource[]>(lair.eventsSourceUrls ?? []);

  const patch = (index: number, next: EventSource) => {
    setSources((previous) => previous.map((source, i) => (i === index ? next : source)));
  };

  const patchMapping = (
    index: number,
    source: EventSource,
    next: Partial<NonNullable<EventSource["mappingConfig"]>>,
  ) => {
    patch(index, { ...source, mappingConfig: { ...emptyMapping(source), ...next } });
  };

  const submit = () => {
    setMessage(null);

    startTransition(async () => {
      const result = await updateLairEventSources(
        lair.id,
        sources.filter((source) => source.url.trim() !== ""),
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

      setMessage(
        result.success
          ? { ok: true, text: result.message || "Événements rafraîchis." }
          : { ok: false, text: result.error ?? "Erreur lors du rafraîchissement" },
      );
    });
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

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sources d&apos;événements</h2>
            <p className="text-sm text-muted-foreground">
              D&apos;où viennent les événements du lieu. Une source lue par l&apos;IA n&apos;a
              besoin que d&apos;une URL ; une source en correspondance décrit un JSON champ par
              champ.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sources.length > 0 && (
              <Button type="button" variant="outline" onClick={refresh} disabled={refreshing}>
                <RefreshCw className="size-4" aria-hidden />
                {refreshing ? "Rafraîchissement…" : "Rafraîchir"}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => setSources([...sources, { url: "", type: "IA", instructions: "" }])}
            >
              <Plus className="size-4" aria-hidden />
              Ajouter une source
            </Button>
          </div>
        </div>

        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune source : les événements de ce lieu ne peuvent être saisis qu&apos;à la main.
          </p>
        ) : (
          <div className="space-y-4">
            {sources.map((source, index) => (
              <div key={index} className="rounded-lg border border-border bg-muted/30 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-foreground">Source #{index + 1}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={source.type === "IA" ? "default" : "outline"}
                        onClick={() =>
                          patch(index, {
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
                          patch(index, {
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
                      onClick={() => setSources(sources.filter((_, i) => i !== index))}
                      aria-label={`Retirer la source ${index + 1}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`source-url-${index}`}
                    className="block text-xs font-medium text-muted-foreground mb-1"
                  >
                    URL de la source
                  </label>
                  <input
                    id={`source-url-${index}`}
                    type="url"
                    value={source.url}
                    onChange={(e) => patch(index, { ...source, url: e.target.value })}
                    placeholder="https://exemple.com/evenements"
                    className={`${FIELD_CLASS} font-mono`}
                  />
                </div>

                {source.type === "IA" && (
                  <div>
                    <label
                      htmlFor={`source-instructions-${index}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Consignes pour l&apos;IA (optionnel)
                    </label>
                    <textarea
                      id={`source-instructions-${index}`}
                      rows={3}
                      value={source.instructions ?? ""}
                      onChange={(e) => patch(index, { ...source, instructions: e.target.value })}
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
                          htmlFor={`source-path-${index}`}
                          className="block text-xs font-medium text-muted-foreground mb-1"
                        >
                          Chemin vers les événements (JSONPath)
                        </label>
                        <input
                          id={`source-path-${index}`}
                          type="text"
                          value={source.mappingConfig?.eventsPath ?? ""}
                          onChange={(e) =>
                            patchMapping(index, source, { eventsPath: e.target.value })
                          }
                          placeholder="events.data"
                          className={`${FIELD_CLASS} font-mono`}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`source-base-${index}`}
                          className="block text-xs font-medium text-muted-foreground mb-1"
                        >
                          Préfixe de base d&apos;URL (optionnel)
                        </label>
                        <input
                          id={`source-base-${index}`}
                          type="text"
                          value={source.mappingConfig?.eventsBaseUrl ?? ""}
                          onChange={(e) =>
                            patchMapping(index, source, { eventsBaseUrl: e.target.value })
                          }
                          placeholder="https://joutes.app/events/"
                          className={`${FIELD_CLASS} font-mono`}
                        />
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
                                htmlFor={`map-${field}-${index}`}
                                className="block font-mono text-xs text-muted-foreground mb-1"
                              >
                                {field}
                              </label>
                              <input
                                id={`map-${field}-${index}`}
                                type="text"
                                value={source.mappingConfig?.eventsFieldsMapping?.[field] ?? ""}
                                onChange={(e) =>
                                  patchMapping(index, source, {
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
                                  htmlFor={`value-${field}-${index}`}
                                  className="block font-mono text-xs text-muted-foreground mb-1"
                                >
                                  {field}
                                </label>
                                <input
                                  id={`value-${field}-${index}`}
                                  type="text"
                                  value={source.mappingConfig?.eventsFieldsValues?.[field] ?? ""}
                                  onChange={(e) =>
                                    patchMapping(index, source, {
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
                              htmlFor={`value-price-${index}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              price
                            </label>
                            <input
                              id={`value-price-${index}`}
                              type="number"
                              step="0.01"
                              value={source.mappingConfig?.eventsFieldsValues?.price ?? ""}
                              onChange={(e) =>
                                patchMapping(index, source, {
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
                              htmlFor={`value-status-${index}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              status
                            </label>
                            <select
                              id={`value-status-${index}`}
                              value={source.mappingConfig?.eventsFieldsValues?.status ?? ""}
                              onChange={(e) =>
                                patchMapping(index, source, {
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
                              htmlFor={`value-url-${index}`}
                              className="block font-mono text-xs text-muted-foreground mb-1"
                            >
                              url
                            </label>
                            <input
                              id={`value-url-${index}`}
                              type="text"
                              value={source.mappingConfig?.eventsFieldsValues?.url ?? ""}
                              onChange={(e) =>
                                patchMapping(index, source, {
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
