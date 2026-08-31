"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { Game } from "@/lib/types/Game.ts";
import { createLair } from "./actions.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

const EMPTY = {
  name: "",
  address: "",
  website: "",
  coordinates: "",
  games: [] as string[],
};

/**
 * Création d'un lieu.
 *
 * De quoi le nommer et le poser sur la carte. Bannière, sources d'événements et
 * vue du calendrier se règlent ensuite sur sa fiche — la boîte y mène une fois
 * le lieu créé. Les sources, en particulier, demandent une largeur qu'une
 * modale n'a pas : c'est tout l'objet de cette refonte.
 */
export function LairForm({ games, trigger }: { games: Game[]; trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY);

  const toggleGame = (gameId: string) => {
    setFormData((previous) => ({
      ...previous,
      games: previous.games.includes(gameId)
        ? previous.games.filter((id) => id !== gameId)
        : [...previous.games, gameId],
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const data: Parameters<typeof createLair>[0] = {
      name: formData.name,
      games: formData.games,
      eventsSourceUrls: [],
    };

    if (formData.coordinates.trim().length > 0) {
      const parts = formData.coordinates.split(",").map((part) => part.trim());
      const latitude = Number.parseFloat(parts[0]);
      const longitude = Number.parseFloat(parts[1]);

      if (parts.length !== 2 || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setError("Coordonnées : attendu « latitude, longitude », deux nombres.");
        return;
      }

      // GeoJSON attend [longitude, latitude] — l'inverse de ce qui se copie
      // depuis une carte.
      data.location = { type: "Point", coordinates: [longitude, latitude] };
    }

    if (formData.address.trim().length > 0) data.address = formData.address.trim();
    if (formData.website.trim().length > 0) data.website = formData.website.trim();

    startTransition(async () => {
      const result = await createLair(data);

      if (result.success && result.lair) {
        setFormData(EMPTY);
        setOpen(false);
        router.push(`/admin/lairs/${result.lair.id}`);
      } else {
        setError(result.error || "Erreur lors de l'ajout du lieu");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFormData(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger || <Button>Ajouter un lieu</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nouveau lieu de jeu</DialogTitle>
          <DialogDescription>
            De quoi le nommer et le situer. Bannière et sources d&apos;événements se règlent
            ensuite sur sa fiche.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-lair-name" className="block text-sm font-medium text-foreground mb-1">
              Nom du lieu
            </label>
            <input
              id="new-lair-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="new-lair-address"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Adresse (optionnel)
            </label>
            <input
              id="new-lair-address"
              type="text"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 rue de la Joute, 75001 Paris"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="new-lair-gps" className="block text-sm font-medium text-foreground mb-1">
              Coordonnées GPS (optionnel)
            </label>
            <input
              id="new-lair-gps"
              type="text"
              value={formData.coordinates}
              onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
              placeholder="48.8566, 2.3522"
              className={`${FIELD_CLASS} font-mono`}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Format : latitude, longitude (exemple : 48.8566, 2.3522 pour Paris).
            </p>
          </div>

          <div>
            <label
              htmlFor="new-lair-website"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Site web (optionnel)
            </label>
            <input
              id="new-lair-website"
              type="url"
              value={formData.website}
              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
              placeholder="https://exemple.com"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-foreground mb-2">Jeux supportés</span>
            <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
              {games.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aucun jeu disponible. Ajoutez-en d&apos;abord dans la section Jeux.
                </p>
              ) : (
                games.map((game) => (
                  <label key={game.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.games.includes(game.id)}
                      onChange={() => toggleGame(game.id)}
                      className="size-4 shrink-0"
                    />
                    <span className="text-sm text-foreground">{game.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
