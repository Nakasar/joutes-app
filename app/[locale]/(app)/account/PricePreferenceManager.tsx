"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch.tsx";
import { PRICE_SOURCE_LABELS } from "@/lib/prices/sources.ts";
import { CARD_PRICE_SOURCES, type CardPricePreference, type CardPriceSource } from "@/lib/types/card-price.ts";
import { updatePricePreferenceAction } from "./price-actions.ts";

/**
 * Le fournisseur dont les prix représentent les cartes du joueur.
 *
 * Trois choix et un interrupteur, pas davantage : le réglage vaut pour tous les
 * jeux, alors que la couverture des fournisseurs, elle, change d'un jeu à
 * l'autre (95 % de Riftbound, 9 % de Star Wars Unlimited — cf.
 * docs/CARD_PRICES.md). Un réglage par jeu se défend ; il multiplierait les
 * écrans pour un choix que peu de joueurs feront deux fois, et le repli répond
 * déjà au cas qui l'a motivé.
 *
 * Ce qui est écrit ici n'est qu'un ordre de fournisseurs, celui que suit la
 * lecture des relevés (`orderedPriceSources`).
 */

/** Ce que chaque choix promet, en une phrase. Ce sont des faits d'import. */
const DESCRIPTIONS: Record<CardPriceSource, string> = {
  cardnexus:
    "Rattaché par extension et numéro de collection : le prix est sûrement celui de cette carte-là. Ne couvre pas encore tous les jeux.",
  cardmarket:
    "Rattaché par nom de carte : le catalogue le plus large, au risque de se tromper de carte entre deux noms voisins.",
};

export default function PricePreferenceManager({
  initialPreference,
}: {
  initialPreference?: CardPricePreference;
}) {
  const [source, setSource] = useState<CardPriceSource | undefined>(initialPreference?.source);
  const [fallback, setFallback] = useState(initialPreference?.fallback !== false);
  const [saving, setSaving] = useState(false);

  const save = async (next: CardPricePreference) => {
    const previous = { source, fallback };
    setSource(next.source);
    setFallback(next.fallback !== false);
    setSaving(true);

    const result = await updatePricePreferenceAction(next);

    setSaving(false);

    if (!result.success) {
      // L'écran ne garde pas un réglage que la base n'a pas : sinon le joueur
      // repartirait en croyant avoir choisi.
      setSource(previous.source);
      setFallback(previous.fallback);
      toast.error("Réglage non enregistré.");
      return;
    }

    toast.success("Réglage enregistré.");
  };

  const choices: { value: CardPriceSource | undefined; name: string; description: string; badge?: string }[] = [
    {
      value: undefined,
      name: "Laisser Joutes choisir",
      description: `${CARD_PRICE_SOURCES.map((key) => PRICE_SOURCE_LABELS[key]).join(", puis ")}, carte par carte.`,
      badge: "Par défaut",
    },
    ...CARD_PRICE_SOURCES.map((key) => ({
      value: key,
      name: PRICE_SOURCE_LABELS[key],
      description: DESCRIPTIONS[key],
    })),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        {choices.map((choice) => {
          const selected = source === choice.value;

          return (
            <button
              key={choice.value ?? "auto"}
              type="button"
              disabled={saving}
              aria-pressed={selected}
              onClick={() => save({ source: choice.value, fallback })}
              className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-60 ${
                selected ? "border-foreground/30 bg-muted" : "hover:bg-muted/45"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-foreground" : "border-foreground/40"
                }`}
              >
                {selected ? <span className="size-2 rounded-full bg-foreground" /> : null}
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{choice.name}</span>
                  {choice.badge ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">{choice.badge}</span>
                  ) : null}
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{choice.description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-3 border-t pt-4">
        <Switch
          checked={fallback}
          disabled={saving || source === undefined}
          onCheckedChange={(checked) => save({ source, fallback: checked })}
          className="mt-0.5"
          aria-label="Compléter avec les autres fournisseurs"
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Compléter avec les autres fournisseurs</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {source === undefined
              ? "Sans fournisseur choisi, Joutes les prend déjà tous dans l'ordre."
              : "Quand votre source n'a pas relevé une carte, Joutes affiche le prix d'un autre plutôt qu'aucun prix. Le fournisseur reste écrit sur la fiche de la carte."}
          </p>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Le réglage vaut pour tous les jeux et partout où un prix s'affiche : galerie, collection, boosters, échanges,
        listes de vente. Il ne change aucun relevé — seulement celui qui vous est montré.
      </p>
    </div>
  );
}
