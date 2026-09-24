"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import type { GameBoosterType } from "@/lib/types/Game.ts";

import { setGameBoosterTypes } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-3 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

type TypeDraft = { id: number; key: string; label: string };

/**
 * Clé tirée d'un libellé, pour une ligne dont on n'a saisi que le nom : même
 * forme que les clés connues (`play-booster`), celle qu'exige le schéma.
 */
function keyFromLabel(label: string): string {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Les types de boosters d'un jeu : ceux proposés à la création d'un booster,
 * dans l'ordre du sélecteur.
 *
 * « Autre » n'est pas dans la liste : il est toujours proposé, en dernier. Un
 * libellé laissé vide garde la traduction du type quand l'application le
 * connaît (affichée en indication), sa clé sinon.
 *
 * Retirer un type ne touche pas aux boosters qui le portent : ils l'affichent
 * toujours, mais il n'est plus proposé et ne sert plus de filtre.
 */
export function BoosterTypesForm({
  gameId,
  initial,
  configured,
  defaults,
  defaultLabels,
}: {
  gameId: string;
  /** Les types en vigueur : ceux du jeu, ou la liste livrée recopiée. */
  initial: GameBoosterType[];
  /** Le jeu porte-t-il déjà sa liste, ou suit-il celle livrée ? */
  configured: boolean;
  /** La liste livrée avec la plateforme, rétablie par « Revenir à la liste livrée ». */
  defaults: string[];
  /** Libellés traduits des types connus de l'application, par clé. */
  defaultLabels: Record<string, string>;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const nextId = useRef(initial.length);
  const [types, setTypes] = useState<TypeDraft[]>(() =>
    initial.map((type, index) => ({ id: index, key: type.key, label: type.label ?? "" })),
  );

  const update = (id: number, patch: Partial<TypeDraft>) =>
    setTypes((current) => current.map((type) => (type.id === id ? { ...type, ...patch } : type)));

  const move = (from: number, to: number) =>
    setTypes((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });

  const add = () => {
    const id = nextId.current++;
    setTypes((current) => [...current, { id, key: "", label: "" }]);
  };

  const save = (payload: GameBoosterType[] | null, success: string) => {
    setMessage(null);
    startTransition(async () => {
      const result = await setGameBoosterTypes(gameId, payload);
      // Le formulaire reste monté après l'enregistrement : il montre à présent
      // la liste livrée, que le jeu suit de nouveau.
      if (result.success && payload === null) {
        setTypes(defaults.map((key) => ({ id: nextId.current++, key, label: "" })));
      }
      setMessage(
        result.success
          ? { ok: true, text: success }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    // Une ligne entièrement vide est un ajout abandonné, pas une erreur.
    const payload = types
      .filter((type) => type.key.trim() || type.label.trim())
      .map((type) => ({
        key: type.key.trim() || keyFromLabel(type.label),
        label: type.label.trim(),
      }));
    save(payload, "Types de boosters enregistrés.");
  };

  const reset = () => {
    save(null, "Le jeu suit de nouveau la liste livrée avec la plateforme.");
  };

  return (
    <form onSubmit={submit} className="space-y-6">
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

      {!configured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Ce jeu suit la liste de types livrée avec la plateforme. Elle est recopiée ci-dessous :
          enregistrer la fige sur le jeu, et il cessera de suivre ses évolutions.
        </div>
      )}

      <section className="bg-card space-y-4 rounded-lg p-6 shadow-md">
        <div>
          <h2 className="text-foreground text-lg font-semibold">Types de boosters</h2>
          <p className="text-muted-foreground text-sm">
            Proposés, dans cet ordre, à la création d&apos;un booster et comme filtres de la liste.
            « Autre » est toujours proposé en dernier. Retirer un type ne modifie pas les boosters
            qui le portent déjà.
          </p>
        </div>

        {types.length === 0 ? (
          <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
            Aucun type : seul « Autre » sera proposé.
          </p>
        ) : (
          <ul className="space-y-3">
            {types.map((type, index) => {
              const name = type.label.trim() || defaultLabels[type.key] || type.key || "ce type";
              return (
                <li
                  key={type.id}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-40 flex-1">
                    <label
                      htmlFor={`booster-type-label-${type.id}`}
                      className="text-foreground mb-1 block text-sm font-medium"
                    >
                      Libellé
                    </label>
                    <input
                      id={`booster-type-label-${type.id}`}
                      value={type.label}
                      maxLength={60}
                      placeholder={defaultLabels[type.key] ?? "Collector Booster"}
                      onChange={(e) => update(type.id, { label: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="min-w-40 flex-1">
                    <label
                      htmlFor={`booster-type-key-${type.id}`}
                      className="text-foreground mb-1 block text-sm font-medium"
                    >
                      Clé
                    </label>
                    <input
                      id={`booster-type-key-${type.id}`}
                      value={type.key}
                      maxLength={40}
                      placeholder={keyFromLabel(type.label) || "collector-booster"}
                      onChange={(e) => update(type.id, { key: e.target.value.toLowerCase() })}
                      className={`${FIELD_CLASS} font-mono`}
                    />
                  </div>
                  <div className="flex shrink-0 items-center gap-1 pb-1.5">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Monter ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === types.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Descendre ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTypes(types.filter((other) => other.id !== type.id))}
                      aria-label={`Retirer ${name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <p className="text-muted-foreground text-xs">
          La clé est la valeur enregistrée sur les boosters : minuscules, chiffres et tirets. Laissée
          vide, elle est tirée du libellé. Changer la clé d&apos;un type revient à en créer un
          nouveau : les boosters existants gardent l&apos;ancienne.
        </p>

        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="size-4" aria-hidden />
          Ajouter un type
        </Button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les types"}
        </Button>
        {configured && (
          <Button type="button" variant="outline" disabled={isPending} onClick={reset}>
            Revenir à la liste livrée
          </Button>
        )}
      </div>
    </form>
  );
}
