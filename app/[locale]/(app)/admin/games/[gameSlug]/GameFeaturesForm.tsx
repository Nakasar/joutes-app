"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Game } from "@/lib/types/Game.ts";
import { GAME_FEATURE_OPTIONS, type GameFeatureKey } from "@/lib/constants/game-features.ts";
import { Switch } from "@/components/ui/switch.tsx";
import { useRouter } from "@/i18n/navigation.ts";
import { updateGameFeatures } from "../actions.ts";

/**
 * Les fonctionnalités qu'un jeu expose, en interrupteurs enregistrés aussitôt :
 * plus de bouton à ne pas oublier en bas de page.
 *
 * La liste se rend depuis `GAME_FEATURE_OPTIONS` : ajouter une fonctionnalité
 * à la table la fait apparaître ici sans toucher à ce fichier.
 */
export function GameFeaturesForm({ game }: { game: Game }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [features, setFeatures] = useState<Partial<Record<GameFeatureKey, boolean>>>(
    game.features ?? {},
  );

  const toggle = (key: GameFeatureKey, label: string, enabled: boolean) => {
    const previous = features;
    const next = { ...features, [key]: enabled };
    setFeatures(next);

    startTransition(async () => {
      const result = await updateGameFeatures(game.id, next);
      if (!result.success) {
        // L'interrupteur revient où il était : l'écran ne montre que ce qui est enregistré.
        setFeatures(previous);
        toast.error(result.error ?? "La fonctionnalité n'a pas pu être enregistrée.");
        return;
      }
      toast.success(`${label} ${enabled ? "activé" : "désactivé"} pour ${game.name}.`);
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-6 py-5">
        <h2 className="text-lg font-semibold text-foreground">Fonctionnalités</h2>
        <p className="text-sm text-muted-foreground">
          Ce que le jeu expose aux joueurs : onglets de la barre d&apos;outils, tuiles de sa fiche et
          routes d&apos;API. Chaque changement est enregistré tout de suite ; une fonctionnalité
          coupée devient invisible, mais rien n&apos;est supprimé.
        </p>
      </div>

      <ul className="divide-y divide-border">
        {GAME_FEATURE_OPTIONS.map(({ value, label, description }) => {
          const id = `feature-${value}`;
          return (
            <li key={value} className="flex items-center gap-4 px-6 py-4">
              <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
                <span className="block text-[15px] font-medium text-foreground">{label}</span>
                <span className="block text-sm text-muted-foreground">{description}</span>
              </label>
              <Switch
                id={id}
                checked={features[value] === true}
                disabled={isPending}
                onCheckedChange={(checked) => toggle(value, label, checked)}
                className="data-[state=checked]:bg-sky-600 dark:data-[state=checked]:bg-sky-500"
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
