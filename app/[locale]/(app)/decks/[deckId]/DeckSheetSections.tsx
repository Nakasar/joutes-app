"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";
import {
  DECK_MATCHUP_LABELS,
  type DeckGuideSection,
  type DeckMatchup,
  type DeckMatchupRating,
} from "@/lib/types/Deck.ts";

/**
 * Carte de la fiche : un titre, éventuellement des actions, un corps.
 *
 * Les quatre sections de la fiche partagent la même boîte pour qu'aucune ne
 * paraisse plus importante qu'une autre — l'ordre suffit à les hiérarchiser.
 */
export function SheetCard({
  title,
  meta,
  actions,
  children,
  className,
}: {
  title: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4 rounded-xl border bg-card p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {meta}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** Bouton d'édition en place d'une section : petit, discret, toujours au même endroit. */
export function EditSectionButton({
  editing,
  onToggleAction,
  disabled,
}: {
  editing: boolean;
  onToggleAction: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 px-2.5 text-xs"
      onClick={onToggleAction}
      disabled={disabled}
    >
      {editing ? "Annuler" : "Modifier"}
    </Button>
  );
}

/**
 * Description du deck, modifiable sur place.
 *
 * L'édition ne quitte pas la fiche : corriger une phrase ne doit pas obliger à
 * traverser un formulaire, puis à revenir pour vérifier le rendu.
 */
export function DescriptionSection({
  description,
  onSaveAction,
}: {
  description?: string;
  onSaveAction: (description: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(description ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const ok = await onSaveAction(draft);
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <SheetCard
      title="Description"
      actions={
        <EditSectionButton
          editing={editing}
          disabled={saving}
          onToggleAction={() => {
            setDraft(description ?? "");
            setEditing((value) => !value);
          }}
        />
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="Ce que fait le deck, ce qu'il cherche, ce qu'il craint…"
            disabled={saving}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      ) : description ? (
        <p className="max-w-[68ch] whitespace-pre-wrap text-[15px] leading-6 text-pretty">
          {description}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune description pour l&apos;instant.
        </p>
      )}
    </SheetCard>
  );
}

/**
 * Guide de jeu : des sections titrées, éditées une par une.
 *
 * Le guide se relit passage par passage — d'où des sections séparées plutôt
 * qu'un second champ de description : on corrige « Ouvertures » sans rouvrir
 * tout le reste.
 */
export function GuideSection({
  guide,
  onSaveAction,
}: {
  guide: DeckGuideSection[];
  onSaveAction: (guide: DeckGuideSection[]) => Promise<boolean>;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<DeckGuideSection>({ title: "", body: "" });
  const [saving, setSaving] = useState(false);

  const commit = async (next: DeckGuideSection[]) => {
    setSaving(true);
    const ok = await onSaveAction(next);
    setSaving(false);
    if (ok) setEditingIndex(null);
    return ok;
  };

  const startEditing = (index: number) => {
    setDraft(guide[index] ?? { title: "", body: "" });
    setEditingIndex(index);
  };

  const addSection = () => {
    setDraft({ title: "", body: "" });
    setEditingIndex(guide.length);
  };

  const saveSection = async () => {
    if (editingIndex === null || !draft.title.trim()) return;
    const next = [...guide];
    next[editingIndex] = { title: draft.title.trim(), body: draft.body };
    await commit(next);
  };

  const removeSection = async (index: number) => {
    await commit(guide.filter((_, position) => position !== index));
  };

  return (
    <SheetCard
      title="Guide"
      meta={
        <span className="text-xs text-muted-foreground">
          {guide.length} section{guide.length > 1 ? "s" : ""}
        </span>
      }
    >
      <div className="flex flex-col gap-3.5">
        {guide.map((section, index) =>
          editingIndex === index ? (
            <GuideSectionEditor
              key={`edit-${index}`}
              draft={draft}
              setDraft={setDraft}
              saving={saving}
              onSaveAction={saveSection}
              onCancelAction={() => setEditingIndex(null)}
              onDeleteAction={() => removeSection(index)}
            />
          ) : (
            <article key={section.title + index} className="flex flex-col gap-1.5 border-t pt-3.5 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <EditSectionButton
                  editing={false}
                  disabled={saving}
                  onToggleAction={() => startEditing(index)}
                />
              </div>
              <p className="max-w-[68ch] whitespace-pre-wrap text-sm leading-[22px] text-muted-foreground">
                {section.body}
              </p>
            </article>
          )
        )}

        {editingIndex === guide.length && (
          <GuideSectionEditor
            draft={draft}
            setDraft={setDraft}
            saving={saving}
            onSaveAction={saveSection}
            onCancelAction={() => setEditingIndex(null)}
          />
        )}

        {guide.length === 0 && editingIndex === null && (
          <p className="text-sm text-muted-foreground">
            Le guide est vide. Ajoutez une première section — plan de jeu, ouvertures, séquence de combat…
          </p>
        )}

        {editingIndex === null && (
          <Button
            type="button"
            variant="outline"
            className="h-8 justify-start border-dashed px-3 text-[13px] text-muted-foreground"
            onClick={addSection}
            disabled={saving}
          >
            <Plus />
            Ajouter une section
          </Button>
        )}
      </div>
    </SheetCard>
  );
}

function GuideSectionEditor({
  draft,
  setDraft,
  saving,
  onSaveAction,
  onCancelAction,
  onDeleteAction,
}: {
  draft: DeckGuideSection;
  setDraft: (section: DeckGuideSection) => void;
  saving: boolean;
  onSaveAction: () => void;
  onCancelAction: () => void;
  onDeleteAction?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-3.5 first:border-t-0 first:pt-0">
      <Input
        value={draft.title}
        onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        placeholder="Titre de la section"
        maxLength={120}
        disabled={saving}
      />
      <Textarea
        value={draft.body}
        onChange={(event) => setDraft({ ...draft, body: event.target.value })}
        rows={5}
        maxLength={4000}
        placeholder="Ce qu'il faut savoir pour jouer ce passage."
        disabled={saving}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onDeleteAction && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto text-destructive hover:text-destructive"
            onClick={onDeleteAction}
            disabled={saving}
          >
            <Trash2 />
            Supprimer
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onCancelAction} disabled={saving}>
          Annuler
        </Button>
        <Button type="button" size="sm" onClick={onSaveAction} disabled={saving || !draft.title.trim()}>
          {saving && <Loader2 className="animate-spin" />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

/**
 * Confrontations : ce que le deck vaut face aux archétypes que l'on croise.
 *
 * Trois appréciations, pas de note chiffrée : personne ne sait dire si un
 * match-up vaut 6,5 sur 10, et tout le monde sait dire s'il est favorable.
 */
export function MatchupsSection({
  matchups,
  editable,
  onSaveAction,
}: {
  matchups: DeckMatchup[];
  editable: boolean;
  onSaveAction?: (matchups: DeckMatchup[]) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DeckMatchup[]>(matchups);
  const [saving, setSaving] = useState(false);

  if (!editable && matchups.length === 0) {
    return null;
  }

  const save = async () => {
    if (!onSaveAction) return;
    setSaving(true);
    const ok = await onSaveAction(draft.filter((matchup) => matchup.name.trim()));
    setSaving(false);
    if (ok) setEditing(false);
  };

  return (
    <SheetCard
      title="Confrontations"
      actions={
        editable ? (
          <EditSectionButton
            editing={editing}
            disabled={saving}
            onToggleAction={() => {
              setDraft(matchups);
              setEditing((value) => !value);
            }}
          />
        ) : undefined
      }
    >
      {editing ? (
        <div className="flex flex-col gap-2">
          {draft.map((matchup, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                value={matchup.name}
                onChange={(event) => {
                  const next = [...draft];
                  next[index] = { ...matchup, name: event.target.value };
                  setDraft(next);
                }}
                placeholder="Archétype adverse"
                maxLength={120}
                className="min-w-40 flex-1"
                disabled={saving}
              />
              <Select
                value={matchup.rating}
                onValueChange={(value: DeckMatchupRating) => {
                  const next = [...draft];
                  next[index] = { ...matchup, rating: value };
                  setDraft(next);
                }}
                disabled={saving}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(DECK_MATCHUP_LABELS) as DeckMatchupRating[]).map((rating) => (
                    <SelectItem key={rating} value={rating}>
                      {DECK_MATCHUP_LABELS[rating]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Retirer ${matchup.name || "la confrontation"}`}
                onClick={() => setDraft(draft.filter((_, position) => position !== index))}
                disabled={saving}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mr-auto border-dashed"
              onClick={() => setDraft([...draft, { name: "", rating: "even" }])}
              disabled={saving || draft.length >= 40}
            >
              <Plus />
              Ajouter
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Enregistrer
            </Button>
          </div>
        </div>
      ) : matchups.length > 0 ? (
        <div className="grid gap-x-6 sm:grid-cols-2">
          {matchups.map((matchup, index) => (
            <div key={matchup.name + index} className="flex items-center justify-between gap-3 border-b py-1.5">
              <span className="min-w-0 truncate text-sm">{matchup.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {DECK_MATCHUP_LABELS[matchup.rating]}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aucune confrontation documentée.
        </p>
      )}
    </SheetCard>
  );
}
