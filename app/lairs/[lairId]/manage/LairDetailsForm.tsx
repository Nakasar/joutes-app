"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { updateLairDetails } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default function LairDetailsForm({
  lair,
  games,
}: {
  lair: Lair;
  games: Game[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: lair.name,
    banner: lair.banner || "",
    games: lair.games || [],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const data = {
        name: formData.name,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        games: formData.games,
      };

      const result = await updateLairDetails(lair.id, data);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(result.error || "Erreur lors de la mise à jour");
      }
    });
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Les modifications ont été enregistrées avec succès
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">Nom du lieu</label>
        <Input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">URL de la bannière</label>
        <Input
          type="url"
          value={formData.banner}
          onChange={(e) => setFormData({ ...formData, banner: e.target.value })}
          placeholder="https://exemple.com/banniere.jpg"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Jeux disponibles</label>
        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
          {games.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun jeu disponible. Ajoutez-en d&apos;abord dans la section administration.
            </p>
          ) : (
            games.map((game) => (
              <label
                key={game.id}
                className="flex items-center space-x-3 cursor-pointer hover:bg-accent p-2 rounded"
              >
                <input
                  type="checkbox"
                  checked={formData.games.includes(game.id)}
                  onChange={() => toggleGame(game.id)}
                  className="rounded text-primary focus:ring-primary"
                />
                <span className="flex-1">{game.name}</span>
                <Badge variant="secondary">{game.type}</Badge>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
        </Button>
      </div>
    </form>
  );
}
