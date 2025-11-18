"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Calendar, MapPin } from "lucide-react";
import { createEventAction } from "./actions";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";

type EventFormProps = {
  ownedLairs: Lair[];
  games: Game[];
};

export default function EventForm({ ownedLairs, games }: EventFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    startDateTime: "",
    endDateTime: "",
    gameName: "",
    lairId: "",
    url: "",
    price: "",
    maxParticipants: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createEventAction({
        name: formData.name,
        startDateTime: formData.startDateTime,
        endDateTime: formData.endDateTime,
        gameName: formData.gameName,
        lairId: formData.lairId || undefined,
        url: formData.url || undefined,
        price: formData.price ? parseFloat(formData.price) : undefined,
        maxParticipants: formData.maxParticipants ? parseInt(formData.maxParticipants, 10) : undefined,
      });

      if (result.success) {
        router.push(`/events/${result.eventId}`);
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue lors de la création de l&apos;événement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Créer un événement
        </CardTitle>
        <CardDescription>
          {ownedLairs.length > 0
            ? "Créez un événement public rattaché à l'un de vos lieux, ou un événement privé"
            : "Créez un événement privé (vous ne possédez aucun lieu)"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Nom de l&apos;événement *
            </label>
            <Input
              id="name"
              required
              maxLength={500}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Tournoi Magic: The Gathering"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="gameName" className="text-sm font-medium">
              Jeu *
            </label>
            <Select
              value={formData.gameName}
              onValueChange={(value) => setFormData({ ...formData, gameName: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez un jeu" />
              </SelectTrigger>
              <SelectContent>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.name}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ownedLairs.length > 0 && (
            <div className="space-y-2">
              <label htmlFor="lairId" className="text-sm font-medium flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lieu (optionnel)
              </label>
              <Select
                value={formData.lairId}
                onValueChange={(value) => setFormData({ ...formData, lairId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Événement privé (sans lieu)" />
                </SelectTrigger>
                <SelectContent>
                  {ownedLairs.map((lair) => (
                    <SelectItem key={lair.id} value={lair.id}>
                      {lair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Si aucun lieu n&apos;est sélectionné, l&apos;événement sera privé et visible uniquement par vous et les participants.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="startDateTime" className="text-sm font-medium">
                Date et heure de début *
              </label>
              <Input
                id="startDateTime"
                type="datetime-local"
                required
                value={formData.startDateTime}
                onChange={(e) => setFormData({ ...formData, startDateTime: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="endDateTime" className="text-sm font-medium">
                Date et heure de fin *
              </label>
              <Input
                id="endDateTime"
                type="datetime-local"
                required
                value={formData.endDateTime}
                onChange={(e) => setFormData({ ...formData, endDateTime: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="url" className="text-sm font-medium">
              URL (optionnel)
            </label>
            <Input
              id="url"
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              placeholder="https://example.com/event"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label htmlFor="price" className="text-sm font-medium">
                Prix (€, optionnel)
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

            <div className="space-y-2">
              <label htmlFor="maxParticipants" className="text-sm font-medium">
                Nombre max de participants (optionnel)
              </label>
              <Input
                id="maxParticipants"
                type="number"
                min="1"
                value={formData.maxParticipants}
                onChange={(e) => setFormData({ ...formData, maxParticipants: e.target.value })}
                placeholder="Illimité"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="submit" disabled={loading}>
              {loading ? "Création..." : "Créer l'événement"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Annuler
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
