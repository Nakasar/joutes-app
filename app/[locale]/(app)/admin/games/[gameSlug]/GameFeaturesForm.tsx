"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game.ts";
import { GAME_FEATURE_OPTIONS, type GameFeatureKey } from "@/lib/constants/game-features.ts";
import { Button } from "@/components/ui/button.tsx";
import { updateGameFeatures } from "../actions.ts";

/**
 * Les fonctionnalités qu'un jeu expose.
 *
 * La liste se rend depuis `GAME_FEATURE_OPTIONS` : ajouter une fonctionnalité
 * à la table la fait apparaître ici sans toucher à ce fichier.
 */
export function GameFeaturesForm({ game }: { game: Game }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [features, setFeatures] = useState<Partial<Record<GameFeatureKey, boolean>>>(
    game.features ?? {},
  );

  const submit = () => {
    setMessage(null);

    startTransition(async () => {
      const result = await updateGameFeatures(game.id, features);

      setMessage(
        result.success
          ? { ok: true, text: "Fonctionnalités enregistrées." }
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

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Fonctionnalités</h2>
          <p className="text-sm text-muted-foreground">
            Ce que le jeu expose aux joueurs : onglets de la barre d&apos;outils, tuiles de sa fiche
            et routes d&apos;API. Une fonctionnalité décochée devient invisible, mais rien n&apos;est
            supprimé.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GAME_FEATURE_OPTIONS.map(({ value, label, description }) => (
            <label
              key={value}
              className="flex items-start gap-2 rounded-lg border border-input p-3 cursor-pointer hover:border-blue-500"
            >
              <input
                type="checkbox"
                checked={features[value] === true}
                onChange={(e) => setFeatures((previous) => ({ ...previous, [value]: e.target.checked }))}
                className="mt-0.5 size-4 shrink-0"
              />
              <span className="min-w-0">
                <span className="block text-sm text-foreground">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer les fonctionnalités"}
        </Button>
      </div>
    </div>
  );
}
