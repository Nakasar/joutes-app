"use client";

import { useState, useTransition, useEffect } from "react";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { createLair, updateLair } from "./actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function LairForm({
  games,
  lair,
  trigger,
}: {
  games: Game[];
  lair?: Lair;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    banner: "",
    games: [] as string[],
    eventsSourceUrls: [] as string[],
  });
  const [uploading, setUploading] = useState(false);

  // Initialiser ou réinitialiser le formulaire avec les données du lair
  useEffect(() => {
    if (open) {
      if (lair) {
        setFormData({
          name: lair.name,
          banner: lair.banner || "",
          games: lair.games || [],
          eventsSourceUrls: lair.eventsSourceUrls || [],
        });
      } else {
        setFormData({
          name: "",
          banner: "",
          games: [],
          eventsSourceUrls: [],
        });
      }
      setError(null);
    }
  }, [open, lair]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const data = {
        name: formData.name,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        games: formData.games,
        eventsSourceUrls: formData.eventsSourceUrls.filter(url => url.trim() !== ""),
      };

      const result = lair
        ? await updateLair(lair.id, data)
        : await createLair(data);

      if (result.success) {
        setFormData({
          name: "",
          banner: "",
          games: [],
          eventsSourceUrls: [],
        });
        setOpen(false);
      } else {
        setError(result.error || `Erreur lors de ${lair ? "la modification" : "l'ajout"} du lieu`);
      }
    });
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
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
      setFormData((prev) => ({ ...prev, banner: data.url }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'upload du fichier"
      );
    } finally {
      setUploading(false);
    }
  };

  const toggleGame = (gameId: string) => {
    setFormData({
      ...formData,
      games: formData.games.includes(gameId)
        ? formData.games.filter((id) => id !== gameId)
        : [...formData.games, gameId],
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            Ajouter un lieu
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lair ? "Modifier le lieu" : "Nouveau lieu de jeu"}
          </DialogTitle>
          <DialogDescription>
            {lair
              ? "Modifiez les informations du lieu de jeu."
              : "Ajoutez un nouveau lieu de jeu avec ses informations."}
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
              Nom du lieu
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
              Bannière du lieu
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={uploading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {uploading && (
                <p className="text-sm text-gray-500">Upload en cours...</p>
              )}
              {formData.banner && !uploading && (
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Jeux supportés
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
              {games.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Aucun jeu disponible. Ajoutez-en d&apos;abord dans la section
                  Jeux.
                </p>
              ) : (
                games.map((game) => (
                  <label
                    key={game.id}
                    className="flex items-center space-x-2 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={formData.games.includes(game.id)}
                      onChange={() => toggleGame(game.id)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      {game.name}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URLs des sources d&apos;événements
            </label>
            <div className="space-y-2">
              {formData.eventsSourceUrls.map((url, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => {
                      const newUrls = [...formData.eventsSourceUrls];
                      newUrls[index] = e.target.value;
                      setFormData({ ...formData, eventsSourceUrls: newUrls });
                    }}
                    placeholder="https://exemple.com/evenements"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newUrls = formData.eventsSourceUrls.filter((_, i) => i !== index);
                      setFormData({ ...formData, eventsSourceUrls: newUrls });
                    }}
                    className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    Retirer
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    ...formData,
                    eventsSourceUrls: [...formData.eventsSourceUrls, ""],
                  });
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Ajouter une URL
              </button>
            </div>
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
              disabled={isPending || uploading}
              className="flex-1"
            >
              {isPending
                ? (lair ? "Modification en cours..." : "Ajout en cours...")
                : (lair ? "Modifier" : "Ajouter")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
