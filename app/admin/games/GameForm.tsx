"use client";

import { useState, useTransition, useEffect } from "react";
import { GameType, Game } from "@/lib/types/Game";
import { GAME_TYPE_OPTIONS } from "@/lib/constants/game-types";
import { createGame, updateGame } from "./actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
    icon: "",
    banner: "",
    description: "",
    type: "TCG" as GameType,
  });
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
          name: game.name,
          icon: game.icon || "",
          banner: game.banner || "",
          description: game.description,
          type: game.type,
        });
      } else {
        setFormData({
          name: "",
          icon: "",
          banner: "",
          description: "",
          type: "TCG",
        });
      }
      setError(null);
    }
  }, [open, game]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const data = {
        name: formData.name,
        icon: formData.icon.length > 0 ? formData.icon : undefined,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        description: formData.description,
        type: formData.type,
      };

      const result = game
        ? await updateGame(game.id, data)
        : await createGame(data);

      if (result.success) {
        setFormData({
          name: "",
          icon: "",
          banner: "",
          description: "",
          type: "TCG",
        });
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
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nom du jeu
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {GAME_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {uploading.icon && (
                <p className="text-sm text-gray-500">Upload en cours...</p>
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
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {uploading.banner && (
                <p className="text-sm text-gray-500">Upload en cours...</p>
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
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              required
              rows={4}
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

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
