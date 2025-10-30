"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createEventAction } from "../actions";
import { Game } from "@/lib/types/Game";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTime } from "luxon";

type EventFormProps = {
  lairId: string;
  games: Game[];
};

export default function EventForm({ lairId, games }: EventFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  // Obtenir la date et heure actuelle en format local pour les inputs
  const now = DateTime.now().setZone('Europe/Paris');
  const defaultStart = now.plus({ hours: 1 }).startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm");
  const defaultEnd = now.plus({ hours: 3 }).startOf('hour').toFormat("yyyy-MM-dd'T'HH:mm");
  
  const [formData, setFormData] = useState({
    name: "",
    startDateTime: defaultStart,
    endDateTime: defaultEnd,
    gameName: games.length > 0 ? games[0].name : "",
    url: "",
    price: "",
    status: "available" as 'available' | 'sold-out' | 'cancelled',
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createEventAction(lairId, {
        name: formData.name,
        startDateTime: formData.startDateTime,
        endDateTime: formData.endDateTime,
        gameName: formData.gameName,
        url: formData.url.length > 0 ? formData.url : undefined,
        price: formData.price.length > 0 ? parseFloat(formData.price) : undefined,
        status: formData.status,
      });

      if (result.success) {
        router.push(`/lairs/${lairId}`);
      } else {
        setError(result.error || "Erreur lors de la création de l'événement");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Nom de l'événement */}
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium">
          Nom de l&apos;événement <span className="text-destructive">*</span>
        </label>
        <Input
          id="name"
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Ex: Tournoi du vendredi soir"
        />
      </div>

      {/* Jeu */}
      <div className="space-y-2">
        <label htmlFor="gameName" className="text-sm font-medium">
          Jeu <span className="text-destructive">*</span>
        </label>
        {games.length > 0 ? (
          <Select
            value={formData.gameName}
            onValueChange={(value) => setFormData({ ...formData, gameName: value })}
          >
            <SelectTrigger id="gameName">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {games.map((game) => (
                <SelectItem key={game.id} value={game.name}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            id="gameName"
            type="text"
            required
            value={formData.gameName}
            onChange={(e) => setFormData({ ...formData, gameName: e.target.value })}
            placeholder="Nom du jeu"
          />
        )}
      </div>

      {/* Date et heure de début */}
      <div className="space-y-2">
        <label htmlFor="startDateTime" className="text-sm font-medium">
          Date et heure de début <span className="text-destructive">*</span>
        </label>
        <Input
          id="startDateTime"
          type="datetime-local"
          required
          value={formData.startDateTime}
          onChange={(e) => setFormData({ ...formData, startDateTime: e.target.value })}
        />
      </div>

      {/* Date et heure de fin */}
      <div className="space-y-2">
        <label htmlFor="endDateTime" className="text-sm font-medium">
          Date et heure de fin <span className="text-destructive">*</span>
        </label>
        <Input
          id="endDateTime"
          type="datetime-local"
          required
          value={formData.endDateTime}
          onChange={(e) => setFormData({ ...formData, endDateTime: e.target.value })}
        />
      </div>

      {/* Statut */}
      <div className="space-y-2">
        <label htmlFor="status" className="text-sm font-medium">
          Statut <span className="text-destructive">*</span>
        </label>
        <Select
          value={formData.status}
          onValueChange={(value) => setFormData({ ...formData, status: value as typeof formData.status })}
        >
          <SelectTrigger id="status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="available">
              <div className="flex items-center gap-2">
                <Badge variant="default">Disponible</Badge>
              </div>
            </SelectItem>
            <SelectItem value="sold-out">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Complet</Badge>
              </div>
            </SelectItem>
            <SelectItem value="cancelled">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">Annulé</Badge>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prix */}
      <div className="space-y-2">
        <label htmlFor="price" className="text-sm font-medium">
          Prix (€) <span className="text-muted-foreground">(optionnel)</span>
        </label>
        <Input
          id="price"
          type="number"
          step="0.01"
          min="0"
          value={formData.price}
          onChange={(e) => setFormData({ ...formData, price: e.target.value })}
          placeholder="0.00"
        />
      </div>

      {/* URL */}
      <div className="space-y-2">
        <label htmlFor="url" className="text-sm font-medium">
          Lien vers l&apos;événement <span className="text-muted-foreground">(optionnel)</span>
        </label>
        <Input
          id="url"
          type="url"
          value={formData.url}
          onChange={(e) => setFormData({ ...formData, url: e.target.value })}
          placeholder="https://exemple.com/evenement"
        />
      </div>

      {/* Boutons */}
      <div className="flex gap-4 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={isPending}
          className="flex-1"
        >
          Annuler
        </Button>
        <Button type="submit" disabled={isPending} className="flex-1">
          {isPending ? "Création en cours..." : "Créer l'événement"}
        </Button>
      </div>
    </form>
  );
}
