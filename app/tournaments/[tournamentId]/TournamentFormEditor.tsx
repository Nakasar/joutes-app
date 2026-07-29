"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { AlertTriangle, Check, Lock, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BoosterCard } from "@/lib/types/booster";
import type {
  TournamentForm,
  TournamentFormAnswer,
  TournamentFormCard,
  TournamentFormField,
} from "@/lib/types/Tournament";
import { CardAnswer, DecklistAnswer, FormAnswersView, LateBadge } from "./TournamentFormAnswers";

type FormPayload = {
  form: TournamentForm | null;
  answers: TournamentFormAnswer[];
  canEdit: boolean;
  // La saisie normale est close, mais les réponses tardives sont acceptées :
  // ce qui est enregistré maintenant par le joueur sera marqué tardif.
  lateWindow: boolean;
  closesAt: string | null;
  gameSlug: string | null;
  decklistSupported: boolean;
};

type DraftValue = {
  text: string;
  number: string;
  choices: string[];
  card: TournamentFormCard | null;
  decklist: string;
};

const EMPTY_DRAFT: DraftValue = { text: "", number: "", choices: [], card: null, decklist: "" };

function buildDraft(form: TournamentForm, answers: TournamentFormAnswer[]): Record<string, DraftValue> {
  const byField = new Map(answers.map((answer) => [answer.fieldId, answer]));
  return Object.fromEntries(
    form.fields.map((field) => {
      const answer = byField.get(field.id);
      return [
        field.id,
        {
          text: answer?.text ?? "",
          number: answer?.number !== undefined ? String(answer.number) : "",
          choices: answer?.choices ?? [],
          card: answer?.card ?? null,
          decklist: answer?.decklist?.input ?? "",
        },
      ];
    })
  );
}

/**
 * Saisie des réponses au formulaire d'inscription. Le même composant sert le
 * joueur depuis son portail et l'organisation depuis la fiche joueur : c'est
 * le serveur qui décide qui a le droit de modifier, le composant ne fait que
 * suivre le `canEdit` qu'il reçoit.
 *
 * `apiFetch` permet au portail joueur d'attacher sa clé de synchronisation ;
 * côté organisation, la session suffit.
 */
export function TournamentFormEditor({
  endpoint,
  apiFetch,
}: {
  endpoint: string;
  apiFetch?: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const t = useTranslations("Tournaments");
  const request = useMemo(
    () => apiFetch ?? ((path: string, init?: RequestInit) => fetch(path, init)),
    [apiFetch]
  );

  const [payload, setPayload] = useState<FormPayload | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Indexé une fois par rendu : chaque champ va chercher sa réponse enregistrée
  // (marque de retard, analyse de liste), et un formulaire peut porter
  // cinquante questions.
  const savedByField = useMemo(
    () => new Map((payload?.answers ?? []).map((answer) => [answer.fieldId, answer])),
    [payload]
  );

  const applyPayload = useCallback((data: FormPayload) => {
    setPayload(data);
    setDraft(data.form ? buildDraft(data.form, data.answers) : {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await request(endpoint);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "");
        }
        const data: FormPayload = await res.json();
        if (!cancelled) applyPayload(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error && err.message ? err.message : t("common.error"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, request, applyPayload, t]);

  const update = (fieldId: string, patch: Partial<DraftValue>) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [fieldId]: { ...(current[fieldId] ?? EMPTY_DRAFT), ...patch } }));
  };

  const submit = async () => {
    if (!payload?.form) return;
    setBusy(true);
    setError(null);
    try {
      const answers = payload.form.fields.map((field) => {
        const value = draft[field.id] ?? EMPTY_DRAFT;
        switch (field.type) {
          case "number": {
            const parsed = Number(value.number);
            return {
              fieldId: field.id,
              number: value.number.trim() && Number.isFinite(parsed) ? parsed : undefined,
            };
          }
          case "single-choice":
          case "multiple-choice":
            return { fieldId: field.id, choices: value.choices };
          case "card":
            return { fieldId: field.id, card: value.card ?? undefined };
          case "decklist":
            return { fieldId: field.id, decklist: value.decklist };
          default:
            return { fieldId: field.id, text: value.text };
        }
      });

      const res = await request(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? t("common.error"));
      }
      applyPayload(body as FormPayload);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }
  if (!payload?.form || payload.form.fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("form.noFormForPlayers")}</p>;
  }

  const { form, canEdit, closesAt } = payload;

  // Formulaire fermé : les réponses restent consultables, c'est la seule
  // manière pour un joueur de vérifier ce qu'il a déclaré.
  if (!canEdit) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-2.5 text-[13px] text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          {closesAt && DateTime.fromISO(closesAt) <= DateTime.now()
            ? t("form.closedByDeadline", {
                date: DateTime.fromISO(closesAt).toFormat("dd/MM HH:mm"),
              })
            : t("form.closedByOrganizer")}
        </p>
        <FormAnswersView form={form} answers={payload.answers} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {payload.lateWindow ? (
        <p className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-[13px] text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {t("form.lateWindowNotice")}
        </p>
      ) : (
        closesAt && (
          <p className="text-[13px] text-muted-foreground">
            {t("form.closesAtNotice", { date: DateTime.fromISO(closesAt).toFormat("dd/MM HH:mm") })}
          </p>
        )
      )}

      {form.fields.map((field) => (
        <FieldInput
          key={field.id}
          field={field}
          value={draft[field.id] ?? EMPTY_DRAFT}
          savedAnswer={savedByField.get(field.id)}
          gameSlug={payload.gameSlug}
          decklistSupported={payload.decklistSupported}
          disabled={busy}
          onChange={(patch) => update(field.id, patch)}
        />
      ))}

      <div className="flex items-center gap-2.5">
        <Button onClick={submit} disabled={busy}>
          {t("common.save")}
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" />
            {t("form.saved")}
          </span>
        )}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  savedAnswer,
  gameSlug,
  decklistSupported,
  disabled,
  onChange,
}: {
  field: TournamentFormField;
  value: DraftValue;
  savedAnswer?: TournamentFormAnswer;
  gameSlug: string | null;
  decklistSupported: boolean;
  disabled: boolean;
  onChange: (patch: Partial<DraftValue>) => void;
}) {
  const t = useTranslations("Tournaments");

  const toggleChoice = (option: string) => {
    if (field.type === "single-choice") {
      onChange({ choices: value.choices[0] === option ? [] : [option] });
      return;
    }
    onChange({
      choices: value.choices.includes(option)
        ? value.choices.filter((choice) => choice !== option)
        : [...value.choices, option],
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="flex flex-wrap items-center gap-1.5 text-sm font-semibold"
        htmlFor={`field-${field.id}`}
      >
        <span>
          {field.label}
          {field.required && <span className="ml-1 text-destructive">*</span>}
        </span>
        {savedAnswer?.late && <LateBadge />}
      </label>
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}

      {field.type === "text" && (
        <Input
          id={`field-${field.id}`}
          value={value.text}
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={disabled}
          maxLength={5000}
        />
      )}

      {field.type === "long-text" && (
        <Textarea
          id={`field-${field.id}`}
          value={value.text}
          onChange={(e) => onChange({ text: e.target.value })}
          disabled={disabled}
          maxLength={5000}
          className="min-h-24"
        />
      )}

      {field.type === "number" && (
        <Input
          id={`field-${field.id}`}
          type="number"
          value={value.number}
          onChange={(e) => onChange({ number: e.target.value })}
          disabled={disabled}
          className="max-w-40"
        />
      )}

      {(field.type === "single-choice" || field.type === "multiple-choice") && (
        <div className="flex flex-wrap gap-1.5">
          {(field.options ?? []).map((option) => {
            const active = value.choices.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => toggleChoice(option)}
                aria-pressed={active}
                disabled={disabled}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50",
                  active ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-accent"
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      )}

      {field.type === "card" && (
        <CardPicker
          gameSlug={gameSlug}
          value={value.card}
          disabled={disabled}
          onChange={(card) => onChange({ card })}
        />
      )}

      {/* Saisie d'une liste de deck : texte, lien Piltover Archive ou code.
          L'analyse est faite à l'enregistrement, côté serveur ; celle de la
          dernière liste enregistrée reste affichée tant que la saisie ne
          change pas, pour que le joueur voie ce qui a été reconnu. Un lien ou
          un code y est remplacé par les cartes récupérées : la saisie montre
          alors la liste effectivement enregistrée. */}
      {field.type === "decklist" && (
        <>
          <Textarea
            id={`field-${field.id}`}
            value={value.decklist}
            onChange={(e) => onChange({ decklist: e.target.value })}
            disabled={disabled}
            maxLength={20000}
            placeholder={
              decklistSupported ? t("form.decklistPlaceholder") : t("form.decklistPlaceholderRaw")
            }
            className="min-h-36 font-mono text-[13px]"
          />
          <p className="text-xs text-muted-foreground">
            {decklistSupported ? t("form.decklistResolvedNotice") : t("form.decklistNoParsing")}
          </p>
          {savedAnswer?.decklist &&
            savedAnswer.decklist.input === value.decklist.trim() &&
            (savedAnswer.decklist.parsed || savedAnswer.decklist.parseError) && (
              <div className="mt-1 rounded-lg border bg-muted/30 p-2.5">
                <DecklistAnswer decklist={savedAnswer.decklist} />
              </div>
            )}
        </>
      )}
    </div>
  );
}

/**
 * Choix d'une carte du jeu du tournoi. La carte retenue est recopiée (nom,
 * visuel, numéro) : la réponse reste lisible même si l'index de recherche
 * change ensuite.
 */
function CardPicker({
  gameSlug,
  value,
  disabled,
  onChange,
}: {
  gameSlug: string | null;
  value: TournamentFormCard | null;
  disabled: boolean;
  onChange: (card: TournamentFormCard | null) => void;
}) {
  const t = useTranslations("Tournaments");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BoosterCard[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!gameSlug || query.trim().length <= 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/games/${gameSlug}/cards?searchQuery=${encodeURIComponent(query)}&setCode=*&lang=all`
        );
        const data: BoosterCard[] = await res.json();
        if (!cancelled) setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, gameSlug]);

  if (!gameSlug) {
    return <p className="text-xs text-muted-foreground">{t("form.cardNoGame")}</p>;
  }

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-2.5">
        <CardAnswer card={value} />
        <Button variant="outline" size="sm" onClick={() => onChange(null)} disabled={disabled}>
          <X className="size-3.5" />
          {t("form.cardChange")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("form.cardSearchPlaceholder")}
          disabled={disabled}
          className="pl-8"
        />
      </div>
      {searching && <p className="text-xs text-muted-foreground">{t("form.cardSearching")}</p>}
      {!searching && query.trim().length > 2 && results.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("form.cardEmpty")}</p>
      )}
      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-lg border">
          {results.map((card) => (
            <button
              key={`${card.id}-${card.lang ?? ""}`}
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange({
                  cardId: card.id,
                  name: card.name,
                  image: card.image || undefined,
                  setCode: card.setCode || undefined,
                  collectorNumber: card.collectorNumber || undefined,
                });
                setQuery("");
                setResults([]);
              }}
              className="flex w-full items-center gap-2.5 p-2 text-left transition-colors hover:bg-accent"
            >
              {card.image && (
                // eslint-disable-next-line @next/next/no-img-element -- visuels servis par les CDN des jeux
                <img src={card.image} alt="" className="h-12 w-auto rounded" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{card.name}</span>
                <span className="block font-mono text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
