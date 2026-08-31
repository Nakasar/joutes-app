"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  DECK_ZONE_KEYS,
  deckZoneRule,
  type DeckZoneBounds,
  type DeckZoneKey,
  type GameDeckBuilder,
} from "@/lib/decks/zones.ts";
import { setGameDeckBuilder } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-3 py-2 border border-input rounded-lg bg-background text-sm focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Une section en cours de saisie : les bornes y sont des chaînes.
 *
 * Un `number | undefined` ne survit pas à un champ que l'on vide pour retaper :
 * il vaudrait `NaN` le temps de la frappe, ou remettrait un `0` que personne
 * n'a demandé. La conversion se fait une fois, à l'enregistrement.
 */
type ZoneDraft = {
  key: DeckZoneKey;
  label: string;
  short: string;
  min: string;
  max: string;
  curve: boolean;
};

function toDraft(zone: DeckZoneBounds): ZoneDraft {
  return {
    key: zone.key,
    label: zone.label,
    short: zone.short,
    min: zone.min === undefined ? "" : String(zone.min),
    max: zone.max === undefined ? "" : String(zone.max),
    curve: zone.curve === true,
  };
}

/** Une borne saisie, ou `undefined` si le champ est vide ou illisible. */
function bound(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed === "") return undefined;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function toBounds(draft: ZoneDraft): DeckZoneBounds {
  const min = bound(draft.min);
  const max = bound(draft.max);

  return {
    key: draft.key,
    label: draft.label.trim(),
    short: draft.short.trim(),
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    ...(draft.curve ? { curve: true } : {}),
  };
}

/** Libellés proposés à l'ajout d'une section encore absente. */
const SUGGESTED: Record<DeckZoneKey, { label: string; short: string }> = {
  legend: { label: "Légende", short: "Légende" },
  champions: { label: "Champions", short: "Champions" },
  maindeck: { label: "Deck principal", short: "Principal" },
  runes: { label: "Runes", short: "Runes" },
  battlefields: { label: "Battlefields", short: "Battlefields" },
  sideboard: { label: "Réserve", short: "Réserve" },
  extra: { label: "Zone extra", short: "Extra" },
};

/**
 * Réglages du deck builder d'un jeu.
 *
 * Le formulaire s'ouvre sur les zones **en vigueur** — celles réglées si le jeu
 * en a, celles livrées avec la plateforme sinon. Un jeu encore vierge se règle
 * donc en partant de ce que ses joueurs voient déjà, et non d'une page blanche.
 *
 * Corollaire : n'enregistrer aucune section rend le jeu aux zones livrées. Un
 * document qui porterait une liste vide décrirait un deck builder sans nulle
 * part où poser une carte.
 */
export function DeckBuilderForm({
  gameId,
  initialZones,
  initial,
  configured,
}: {
  gameId: string;
  initialZones: DeckZoneBounds[];
  initial?: GameDeckBuilder;
  /** Le jeu porte-t-il déjà des réglages, ou suit-il les zones livrées ? */
  configured: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [zones, setZones] = useState<ZoneDraft[]>(initialZones.map(toDraft));
  const [maxCopies, setMaxCopies] = useState(
    initial?.maxCopies === undefined ? "" : String(initial.maxCopies),
  );
  const [totalMin, setTotalMin] = useState(
    initial?.totalMin === undefined ? "" : String(initial.totalMin),
  );
  const [totalMax, setTotalMax] = useState(
    initial?.totalMax === undefined ? "" : String(initial.totalMax),
  );
  const [unlimitedTypes, setUnlimitedTypes] = useState((initial?.unlimitedTypes ?? []).join(", "));

  const update = (key: DeckZoneKey, patch: Partial<ZoneDraft>) => {
    setZones((previous) =>
      previous.map((zone) => (zone.key === key ? { ...zone, ...patch } : zone)),
    );
  };

  const move = (index: number, target: number) => {
    if (target < 0 || target >= zones.length) return;

    const next = [...zones];
    [next[index], next[target]] = [next[target], next[index]];
    setZones(next);
  };

  const missing = DECK_ZONE_KEYS.filter((key) => !zones.some((zone) => zone.key === key));

  const submit = () => {
    setMessage(null);

    const body = {
      zones: zones.map(toBounds),
      ...(bound(maxCopies) === undefined ? {} : { maxCopies: bound(maxCopies) }),
      ...(bound(totalMin) === undefined ? {} : { totalMin: bound(totalMin) }),
      ...(bound(totalMax) === undefined ? {} : { totalMax: bound(totalMax) }),
      ...(unlimitedTypes.trim() === ""
        ? {}
        : {
            unlimitedTypes: unlimitedTypes
              .split(",")
              .map((type) => type.trim())
              .filter((type) => type.length > 0),
          }),
    };

    startTransition(async () => {
      const result = await setGameDeckBuilder(gameId, body);

      setMessage(
        result.success
          ? {
              ok: true,
              text:
                body.zones.length > 0
                  ? "Réglages du deck builder enregistrés."
                  : "Le jeu suit de nouveau les zones livrées avec la plateforme.",
            }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
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

      {!configured && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
          Ce jeu suit les sections livrées avec la plateforme. Elles sont recopiées ci-dessous :
          enregistrer les fige sur le jeu, et il cessera de suivre leurs évolutions.
        </div>
      )}

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sections du deck</h2>
          <p className="text-sm text-muted-foreground">
            Le découpage suit le jeu, pas le deck : deux decks du même jeu se rangent de la même
            façon. Une section retirée n&apos;efface rien — les cartes qu&apos;elle porte
            réapparaîtront si elle est remise.
          </p>
        </div>

        {zones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune section : à l&apos;enregistrement, le jeu reviendra aux sections livrées avec la
            plateforme.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {zones.map((zone, index) => (
              <li key={zone.key} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="font-mono text-xs text-muted-foreground border border-border rounded-full px-2 py-0.5">
                    {zone.key}
                  </span>
                  <span className="text-sm text-muted-foreground">{deckZoneRule(toBounds(zone))}</span>
                  <span className="flex-1" />
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => move(index, index - 1)}
                      aria-label={`Monter ${zone.label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={index === zones.length - 1}
                      onClick={() => move(index, index + 1)}
                      aria-label={`Descendre ${zone.label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZones(zones.filter((other) => other.key !== zone.key))}
                      aria-label={`Retirer ${zone.label}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  <div className="col-span-2">
                    <label
                      htmlFor={`label-${zone.key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Libellé
                    </label>
                    <input
                      id={`label-${zone.key}`}
                      type="text"
                      value={zone.label}
                      onChange={(e) => update(zone.key, { label: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`short-${zone.key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Court
                    </label>
                    <input
                      id={`short-${zone.key}`}
                      type="text"
                      value={zone.short}
                      onChange={(e) => update(zone.key, { short: e.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`min-${zone.key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Min
                    </label>
                    <input
                      id={`min-${zone.key}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={zone.min}
                      onChange={(e) => update(zone.key, { min: e.target.value })}
                      placeholder="—"
                      className={FIELD_CLASS}
                    />
                  </div>

                  <div>
                    <label
                      htmlFor={`max-${zone.key}`}
                      className="block text-xs font-medium text-muted-foreground mb-1"
                    >
                      Max
                    </label>
                    <input
                      id={`max-${zone.key}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={zone.max}
                      onChange={(e) => update(zone.key, { max: e.target.value })}
                      placeholder="—"
                      className={FIELD_CLASS}
                    />
                  </div>

                  <label className="flex items-end gap-2 pb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={zone.curve}
                      onChange={(e) => update(zone.key, { curve: e.target.checked })}
                      className="size-4 shrink-0"
                    />
                    <span className="text-xs text-muted-foreground">Courbe</span>
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        {missing.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
            <span className="text-sm text-muted-foreground">Ajouter une section :</span>
            {missing.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setZones([...zones, { key, ...SUGGESTED[key], min: "", max: "", curve: false }])
                }
              >
                <Plus className="size-4" aria-hidden />
                {SUGGESTED[key].label}
              </Button>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Les clés se choisissent dans une liste fermée : elles sont écrites dans les decks et
          relues à l&apos;import comme à l&apos;export d&apos;une liste.
        </p>
      </section>

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Règles du deck</h2>
          <p className="text-sm text-muted-foreground">
            Ce qui vaut pour le deck entier, quelle que soit la section. Un champ laissé vide ne
            contraint rien.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="max-copies" className="block text-sm font-medium text-foreground mb-1">
              Exemplaires par carte
            </label>
            <input
              id="max-copies"
              type="number"
              min={1}
              inputMode="numeric"
              value={maxCopies}
              onChange={(e) => setMaxCopies(e.target.value)}
              placeholder="—"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="total-min" className="block text-sm font-medium text-foreground mb-1">
              Taille totale — min
            </label>
            <input
              id="total-min"
              type="number"
              min={0}
              inputMode="numeric"
              value={totalMin}
              onChange={(e) => setTotalMin(e.target.value)}
              placeholder="—"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="total-max" className="block text-sm font-medium text-foreground mb-1">
              Taille totale — max
            </label>
            <input
              id="total-max"
              type="number"
              min={0}
              inputMode="numeric"
              value={totalMax}
              onChange={(e) => setTotalMax(e.target.value)}
              placeholder="—"
              className={FIELD_CLASS}
            />
          </div>
        </div>

        <div>
          <label htmlFor="unlimited" className="block text-sm font-medium text-foreground mb-1">
            Cartes hors plafond
          </label>
          <input
            id="unlimited"
            type="text"
            value={unlimitedTypes}
            onChange={(e) => setUnlimitedTypes(e.target.value)}
            placeholder="Rune, Terrain de base"
            className={FIELD_CLASS}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Types de cartes exemptés du plafond d&apos;exemplaires, séparés par des virgules.
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer le deck builder"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Les decks déjà enregistrés ne sont pas modifiés : ces bornes ne décident que de ce
          qu&apos;ils affichent et de leur conformité.
        </span>
      </div>
    </div>
  );
}
