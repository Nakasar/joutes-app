"use client";

import { useState, useTransition, useEffect } from "react";
import { GameType, Game } from "@/lib/types/Game.ts";
import { GAME_TYPE_OPTIONS } from "@/lib/constants/game-types.ts";
import { GAME_FEATURE_OPTIONS, type GameFeatureKey } from "@/lib/constants/game-features.ts";
import { createGame, updateGame } from "./actions.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { FeaturedLairsManager } from "./FeaturedLairsManager.tsx";

export function GameForm({
  game,
  trigger,
}: {
  game?: Game;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    icon: "",
    banner: "",
    description: "",
    type: "TCG" as GameType,
  });
  const [features, setFeatures] = useState<Partial<Record<GameFeatureKey, boolean>>>({});
  const [uploading, setUploading] = useState<{
    icon: boolean;
    banner: boolean;
  }>({
    icon: false,
    banner: false,
  });

  // Initialiser ou réinitialiser le formulaire avec les données du jeu
  useEffect(() => {
    if (open) {
      if (game) {
        setFormData({
          slug: game.slug || "",
          name: game.name,
          icon: game.icon || "",
          banner: game.banner || "",
          description: game.description,
          type: game.type,
        });
        setFeatures(game.features ?? {});
      } else {
        setFormData({
          slug: "",
          name: "",
          icon: "",
          banner: "",
          description: "",
          type: "TCG",
        });
        setFeatures({});
      }
      setError(null);
    }
  }, [open, game]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const data = {
        slug: formData.slug.length > 0 ? formData.slug : undefined,
        name: formData.name,
        icon: formData.icon.length > 0 ? formData.icon : undefined,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        description: formData.description,
        type: formData.type,
        features,
      };

      const result = game
        ? await updateGame(game.id, data)
        : await createGame(data);

      if (result.success) {
        setFormData({
          slug: "",
          name: "",
          icon: "",
          banner: "",
          description: "",
          type: "TCG",
        });
        setFeatures({});
        setOpen(false);
      } else {
        setError(result.error || `Erreur lors de ${game ? "la modification" : "l'ajout"} du jeu`);
      }
    });
  };

  const handleFileUpload = async (
    file: File,
    type: "icon" | "banner"
  ) => {
    setUploading((prev) => ({ ...prev, [type]: true }));
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'upload");
      }

      const data = await response.json();
      setFormData((prev) => ({ ...prev, [type]: data.url }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'upload du fichier"
      );
    } finally {
      setUploading((prev) => ({ ...prev, [type]: false }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            Ajouter un jeu
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {game ? "Modifier le jeu" : "Nouveau jeu"}
          </DialogTitle>
          <DialogDescription>
            {game
              ? "Modifiez les informations du jeu."
              : "Ajoutez un nouveau jeu avec ses informations."}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Nom du jeu
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              ID du jeu
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={(e) =>
                setFormData({ ...formData, slug: e.target.value })
              }
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Type de jeu
            </label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  type: e.target.value as GameType,
                })
              }
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
            >
              {GAME_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Icône du jeu
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "icon");
                }}
                disabled={uploading.icon}
                className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              {uploading.icon && (
                <p className="text-sm text-muted-foreground">Upload en cours...</p>
              )}
              {formData.icon && !uploading.icon && (
                <div className="flex items-center gap-2">
                  <img
                    src={formData.icon}
                    alt="Icône"
                    className="w-16 h-16 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, icon: "" })
                    }
                    className="text-sm text-destructive hover:text-destructive/80"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Bannière du jeu
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file, "banner");
                }}
                disabled={uploading.banner}
                className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              {uploading.banner && (
                <p className="text-sm text-muted-foreground">Upload en cours...</p>
              )}
              {formData.banner && !uploading.banner && (
                <div className="flex items-center gap-2">
                  <img
                    src={formData.banner}
                    alt="Bannière"
                    className="w-32 h-16 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, banner: "" })
                    }
                    className="text-sm text-destructive hover:text-destructive/80"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Description
            </label>
            <textarea
              required
              rows={4}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>

          <div className="pt-4 border-t space-y-3">
            <div>
              <p className="text-sm font-medium text-foreground">Fonctionnalités</p>
              <p className="text-xs text-muted-foreground">
                Ce que le jeu expose aux joueurs : onglets de la barre d&apos;outils, tuiles de sa fiche et routes
                d&apos;API. Une fonctionnalité décochée devient invisible, mais rien n&apos;est supprimé.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GAME_FEATURE_OPTIONS.map(({ value, label, description }) => (
                <label
                  key={value}
                  className="flex items-start gap-2 rounded-lg border border-input p-2 cursor-pointer hover:border-blue-500"
                >
                  <input
                    type="checkbox"
                    checked={features[value] === true}
                    onChange={(e) =>
                      setFeatures((prev) => ({ ...prev, [value]: e.target.checked }))
                    }
                    className="mt-0.5 size-4 shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {game && (
            <div className="pt-4 border-t">
              <FeaturedLairsManager game={game} />
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending || uploading.icon || uploading.banner}
              className="flex-1"
            >
              {isPending
                ? (game ? "Modification en cours..." : "Ajout en cours...")
                : (game ? "Modifier" : "Ajouter")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
