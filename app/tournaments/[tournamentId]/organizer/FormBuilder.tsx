"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  TOURNAMENT_FORM_FIELD_TYPES,
  type TournamentForm,
  type TournamentFormFieldType,
} from "@/lib/types/Tournament";
import { OrganizerPageHeader } from "./OrganizerPageHeader";

type DraftField = {
  // Absent pour un champ neuf : le serveur lui attribue son identifiant.
  id?: string;
  // Clé de rendu stable côté React, indépendante de l'identifiant serveur :
  // deux champs neufs ne doivent pas partager la même clé.
  key: string;
  type: TournamentFormFieldType;
  label: string;
  description: string;
  required: boolean;
  options: string[];
};

const CHOICE_TYPES: TournamentFormFieldType[] = ["single-choice", "multiple-choice"];

function toDraft(form: TournamentForm | null): DraftField[] {
  return (form?.fields ?? []).map((field, index) => ({
    id: field.id,
    key: field.id || `field-${index}`,
    type: field.type,
    label: field.label,
    description: field.description ?? "",
    required: field.required,
    options: field.options ?? [],
  }));
}

/**
 * Construction du formulaire d'inscription : la liste des questions, et les
 * deux verrous qui décident si un joueur peut encore répondre (modification
 * autorisée, date limite).
 *
 * Les identifiants de champ ne sont jamais recréés ici : ce sont eux qui
 * rattachent les réponses déjà données, renommer une question ne doit pas
 * vider ce que les joueurs ont déclaré.
 */
export function FormBuilder({
  tournamentId,
  initialForm,
  decklistSupported,
  hasGame,
}: {
  tournamentId: string;
  initialForm: TournamentForm | null;
  decklistSupported: boolean;
  hasGame: boolean;
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();

  const [fields, setFields] = useState<DraftField[]>(() => toDraft(initialForm));
  const [playerEditable, setPlayerEditable] = useState(initialForm?.playerEditable ?? true);
  const [closesAt, setClosesAt] = useState(
    initialForm?.closesAt
      ? DateTime.fromJSDate(new Date(initialForm.closesAt)).toFormat("yyyy-MM-dd'T'HH:mm")
      : ""
  );
  const [newType, setNewType] = useState<TournamentFormFieldType>("text");
  // Compteur des champs neufs : leur clé de rendu doit être unique et stable
  // le temps de la saisie, avant que le serveur ne leur donne un identifiant.
  const nextKey = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const touched = () => {
    setSaved(false);
    setError(null);
  };

  const patchField = (index: number, patch: Partial<DraftField>) => {
    touched();
    setFields((current) =>
      current.map((field, i) => (i === index ? { ...field, ...patch } : field))
    );
  };

  const addField = () => {
    touched();
    nextKey.current += 1;
    setFields((current) => [
      ...current,
      {
        key: `new-${nextKey.current}`,
        type: newType,
        label: "",
        description: "",
        required: false,
        options: CHOICE_TYPES.includes(newType) ? [""] : [],
      },
    ]);
  };

  const removeField = (index: number) => {
    touched();
    setFields((current) => current.filter((_, i) => i !== index));
  };

  const moveField = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= fields.length) return;
    touched();
    setFields((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const parsedClosesAt = closesAt ? DateTime.fromISO(closesAt) : null;
      const res = await fetch(`/api/tournaments/${tournamentId}/form`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: fields.map((field) => ({
            id: field.id,
            type: field.type,
            label: field.label.trim(),
            description: field.description.trim() || undefined,
            required: field.required,
            options: CHOICE_TYPES.includes(field.type)
              ? field.options.map((option) => option.trim()).filter(Boolean)
              : undefined,
          })),
          playerEditable,
          closesAt: parsedClosesAt?.isValid ? parsedClosesAt.toISO() : null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error ?? t("common.error"));
      }
      setFields(toDraft(body.form as TournamentForm));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <OrganizerPageHeader
        title={t("form.builderTitle")}
        description={t("form.builderDescription")}
        actions={
          <div className="flex items-center gap-2.5">
            {saved && (
              <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="size-4" />
                {t("form.saved")}
              </span>
            )}
            <Button onClick={save} disabled={busy}>
              {t("common.save")}
            </Button>
          </div>
        }
      />

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="mb-4 rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">{t("form.rulesTitle")}</h2>
        <div className="flex flex-col gap-3.5">
          <label className="flex items-start justify-between gap-4">
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t("form.playerEditable")}</span>
              <span className="block text-xs text-muted-foreground">
                {t("form.playerEditableHint")}
              </span>
            </span>
            <Switch
              checked={playerEditable}
              onCheckedChange={(checked) => {
                touched();
                setPlayerEditable(checked);
              }}
              disabled={busy}
            />
          </label>
          <div>
            <Label htmlFor="form-closes-at">{t("form.closesAt")}</Label>
            <div className="mt-1 flex items-center gap-2">
              <Input
                id="form-closes-at"
                type="datetime-local"
                value={closesAt}
                onChange={(e) => {
                  touched();
                  setClosesAt(e.target.value);
                }}
                disabled={busy}
                className="max-w-64"
              />
              {closesAt && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    touched();
                    setClosesAt("");
                  }}
                  disabled={busy}
                >
                  <X className="size-3.5" />
                  {t("form.clearClosesAt")}
                </Button>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("form.closesAtHint")}</p>
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {fields.length === 0 && (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("form.noFields")}
          </p>
        )}

        {fields.map((field, index) => (
          <section key={field.key} className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                {t(`form.fieldTypes.${field.type}`)}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveField(index, -1)}
                  disabled={busy || index === 0}
                  aria-label={t("form.moveUp")}
                >
                  <ArrowUp className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => moveField(index, 1)}
                  disabled={busy || index === fields.length - 1}
                  aria-label={t("form.moveDown")}
                >
                  <ArrowDown className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                  disabled={busy}
                  aria-label={t("form.removeField")}
                >
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`label-${field.key}`}>{t("form.fieldLabel")}</Label>
                <Input
                  id={`label-${field.key}`}
                  value={field.label}
                  onChange={(e) => patchField(index, { label: e.target.value })}
                  disabled={busy}
                  maxLength={200}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor={`description-${field.key}`}>{t("form.fieldDescription")}</Label>
                <Input
                  id={`description-${field.key}`}
                  value={field.description}
                  onChange={(e) => patchField(index, { description: e.target.value })}
                  disabled={busy}
                  maxLength={500}
                  placeholder={t("form.fieldDescriptionPlaceholder")}
                  className="mt-1"
                />
              </div>
            </div>

            {CHOICE_TYPES.includes(field.type) && (
              <div className="mt-3">
                <Label>{t("form.fieldOptions")}</Label>
                <div className="mt-1 flex flex-col gap-1.5">
                  {field.options.map((option, optionIndex) => (
                    <div key={optionIndex} className="flex items-center gap-1.5">
                      <Input
                        value={option}
                        onChange={(e) =>
                          patchField(index, {
                            options: field.options.map((current, i) =>
                              i === optionIndex ? e.target.value : current
                            ),
                          })
                        }
                        disabled={busy}
                        maxLength={200}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          patchField(index, {
                            options: field.options.filter((_, i) => i !== optionIndex),
                          })
                        }
                        disabled={busy}
                        aria-label={t("form.removeOption")}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => patchField(index, { options: [...field.options, ""] })}
                    disabled={busy}
                  >
                    <Plus className="size-3.5" />
                    {t("form.addOption")}
                  </Button>
                </div>
              </div>
            )}

            {field.type === "decklist" && !decklistSupported && (
              <p className="mt-3 text-xs text-muted-foreground">
                {hasGame ? t("form.decklistGameUnsupported") : t("form.decklistNoGame")}
              </p>
            )}
            {field.type === "card" && !hasGame && (
              <p className="mt-3 text-xs text-muted-foreground">{t("form.cardNoGame")}</p>
            )}

            <label className="mt-3 flex items-center justify-between gap-4">
              <span className="text-sm font-medium">{t("form.fieldRequired")}</span>
              <Switch
                checked={field.required}
                onCheckedChange={(checked) => patchField(index, { required: checked })}
                disabled={busy}
              />
            </label>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed p-3">
        <Select value={newType} onValueChange={(value) => setNewType(value as TournamentFormFieldType)}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TOURNAMENT_FORM_FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`form.fieldTypes.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={addField} disabled={busy}>
          <Plus className="size-4" />
          {t("form.addField")}
        </Button>
      </div>
    </div>
  );
}
