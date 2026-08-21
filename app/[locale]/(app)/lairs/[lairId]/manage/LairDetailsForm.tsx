"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game.ts";
import { Lair } from "@/lib/types/Lair.ts";
import { useTranslations } from "next-intl";
import { updateLairDetails, type LairManageError } from "./actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";

/** Les échecs de l'action serveur, traduits ici — elle ne renvoie que des codes. */
const ERROR_KEYS: Record<LairManageError, string> = {
  NOT_FOUND: "errors.notFound",
  USER_NOT_FOUND: "errors.userNotFound",
  INVALID: "errors.invalid",
  FAILED: "errors.failed",
};

export default function LairDetailsForm({
  lair,
  games,
}: {
  lair: Lair;
  games: Game[];
}) {
  const t = useTranslations("Lairs.manage.details");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: lair.name,
    banner: lair.banner || "",
    games: lair.games || [],
    coordinates: lair.location 
      ? `${lair.location.coordinates[1]}, ${lair.location.coordinates[0]}` 
      : "",
    address: lair.address || "",
    website: lair.website || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      const data: {
        name: string;
        banner?: string;
        games: string[];
        location?: { type: "Point"; coordinates: [number, number] };
        address?: string;
        website?: string;
      } = {
        name: formData.name,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        games: formData.games,
      };

      // Ajouter les coordonnées si le champ est rempli
      if (formData.coordinates.trim().length > 0) {
        const parts = formData.coordinates.split(',').map(s => s.trim());
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lon = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) {
            // Format GeoJSON : [longitude, latitude]
            data.location = {
              type: "Point",
              coordinates: [lon, lat]
            };
          }
        }
      }

      // Ajouter l'adresse si elle est remplie
      if (formData.address.trim().length > 0) {
        data.address = formData.address.trim();
      }

      // Ajouter le site web s'il est rempli
      if (formData.website.trim().length > 0) {
        data.website = formData.website.trim();
      }

      const result = await updateLairDetails(lair.id, data);

      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        // Le champ visé, quand la validation en désigne un : « Site web est
        // invalide » situe la faute, là où « certains champs » la laisse
        // chercher.
        const field = "field" in result ? result.field : undefined;
        setError(
          result.error === "INVALID" && field
            ? t("errors.invalidField", { field: t(`fields.${field}`) })
            : t(ERROR_KEYS[result.error]),
        );
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
          {t("saved")}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.name")}</label>
        <Input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.banner")}</label>
        <Input
          type="url"
          value={formData.banner}
          onChange={(e) => setFormData({ ...formData, banner: e.target.value })}
          placeholder={t("placeholders.banner")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.address")}</label>
        <Input
          type="text"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          placeholder={t("placeholders.address")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.website")}</label>
        <Input
          type="url"
          value={formData.website}
          onChange={(e) => setFormData({ ...formData, website: e.target.value })}
          placeholder={t("placeholders.website")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.location")}</label>
        <Input
          type="text"
          value={formData.coordinates}
          onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
          placeholder={t("placeholders.location")}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t("locationHint")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">{t("fields.games")}</label>
        <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-3">
          {games.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noGames")}
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
          {isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}
