"use client";

import { useState, useTransition } from "react";
import { Game, GameType } from "@/lib/types/Game.ts";
import { GAME_TYPE_OPTIONS } from "@/lib/constants/game-types.ts";
import { Button } from "@/components/ui/button.tsx";
import { updateGame } from "../actions.ts";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

/**
 * Identité d'un jeu.
 *
 * N'envoie ni `features` ni `featuredLairs` : `updateGame` conserve les fanions
 * qu'il ne reçoit pas, et les deux autres onglets écrivent les leurs. Deux
 * onglets ouverts côte à côte ne se recouvrent donc pas.
 */
export function GameIdentityForm({ game }: { game: Game }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploading, setUploading] = useState<{ icon: boolean; banner: boolean }>({
    icon: false,
    banner: false,
  });
  const [form, setForm] = useState({
    name: game.name,
    slug: game.slug ?? "",
    icon: game.icon ?? "",
    banner: game.banner ?? "",
    description: game.description,
    type: game.type as GameType,
  });

  const upload = async (file: File, kind: "icon" | "banner") => {
    setUploading((previous) => ({ ...previous, [kind]: true }));
    setMessage(null);

    try {
      const body = new FormData();
      body.append("file", file);

      const response = await fetch("/api/upload", { method: "POST", body });

      if (!response.ok) {
        const failure = await response.json();
        throw new Error(failure.error || "Erreur lors de l'upload");
      }

      const data = await response.json();
      setForm((previous) => ({ ...previous, [kind]: data.url }));
    } catch (error) {
      setMessage({
        ok: false,
        text: error instanceof Error ? error.message : "Erreur lors de l'upload du fichier",
      });
    } finally {
      setUploading((previous) => ({ ...previous, [kind]: false }));
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);

    startTransition(async () => {
      const result = await updateGame(game.id, {
        name: form.name,
        slug: form.slug.length > 0 ? form.slug : undefined,
        icon: form.icon.length > 0 ? form.icon : undefined,
        banner: form.banner.length > 0 ? form.banner : undefined,
        description: form.description,
        type: form.type,
      });

      setMessage(
        result.success
          ? { ok: true, text: "Identité enregistrée." }
          : { ok: false, text: result.error ?? "Erreur lors de l'enregistrement" },
      );
    });
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

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Identité</h2>
          <p className="text-sm text-muted-foreground">
            Ce que la fiche du jeu affiche, et ce sur quoi ses adresses sont bâties.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="game-name" className="block text-sm font-medium text-foreground mb-1">
              Nom du jeu
            </label>
            <input
              id="game-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="game-slug" className="block text-sm font-medium text-foreground mb-1">
              ID du jeu
            </label>
            <input
              id="game-slug"
              type="text"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              className={`${FIELD_CLASS} font-mono`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Sert d&apos;adresse : /games/{form.slug || game.id}. Le changer casse les liens déjà
              partagés.
            </p>
          </div>

          <div>
            <label htmlFor="game-type" className="block text-sm font-medium text-foreground mb-1">
              Type de jeu
            </label>
            <select
              id="game-type"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as GameType })}
              className={FIELD_CLASS}
            >
              {GAME_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="game-description" className="block text-sm font-medium text-foreground mb-1">
            Description
          </label>
          <textarea
            id="game-description"
            required
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </section>

      <section className="bg-card rounded-lg shadow-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Images</h2>
          <p className="text-sm text-muted-foreground">
            Icône carrée et bannière large. Rien n&apos;est effacé tant qu&apos;un remplacement
            n&apos;a pas abouti.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <span className="block text-sm font-medium text-foreground mb-1">Icône</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Icône du jeu"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file, "icon");
              }}
              disabled={uploading.icon}
              className={FIELD_CLASS}
            />
            {uploading.icon && (
              <p className="text-sm text-muted-foreground mt-2">Upload en cours...</p>
            )}
            {form.icon && !uploading.icon && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.icon} alt="Icône" className="w-16 h-16 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, icon: "" })}
                  className="text-sm text-destructive hover:text-destructive/80"
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>

          <div>
            <span className="block text-sm font-medium text-foreground mb-1">Bannière</span>
            <input
              type="file"
              accept="image/*"
              aria-label="Bannière du jeu"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload(file, "banner");
              }}
              disabled={uploading.banner}
              className={FIELD_CLASS}
            />
            {uploading.banner && (
              <p className="text-sm text-muted-foreground mt-2">Upload en cours...</p>
            )}
            {form.banner && !uploading.banner && (
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.banner} alt="Bannière" className="w-32 h-16 object-cover rounded" />
                <button
                  type="button"
                  onClick={() => setForm({ ...form, banner: "" })}
                  className="text-sm text-destructive hover:text-destructive/80"
                >
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isPending || uploading.icon || uploading.banner}>
          {isPending ? "Enregistrement…" : "Enregistrer l'identité"}
        </Button>
      </div>
    </form>
  );
}
