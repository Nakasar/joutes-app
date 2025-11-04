"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createGameMatchAction } from "../actions";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateTime } from "luxon";
import { X } from "lucide-react";

type GameMatchFormProps = {
  games: Game[];
  lairs: Lair[];
  currentUser: User;
};

type PlayerInput = {
  id: string;
  username: string;
  displayName?: string;
  discriminator?: string;
};

export default function GameMatchForm({ games, lairs, currentUser }: GameMatchFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  
  // Date et heure par défaut (maintenant)
  const now = DateTime.now().setZone('Europe/Paris');
  const defaultDateTime = now.toFormat("yyyy-MM-dd'T'HH:mm");
  
  const [formData, setFormData] = useState({
    gameId: games.length > 0 ? games[0].id : "",
    playedAt: defaultDateTime,
    lairId: "",
  });

  // Le joueur courant est automatiquement ajouté
  const [players, setPlayers] = useState<PlayerInput[]>([
    {
      id: currentUser.id,
      username: currentUser.displayName && currentUser.discriminator
        ? `${currentUser.displayName}#${currentUser.discriminator}`
        : currentUser.username,
      displayName: currentUser.displayName,
      discriminator: currentUser.discriminator,
    },
  ]);

  const [newPlayerTag, setNewPlayerTag] = useState("");

  const addPlayer = () => {
    const trimmedTag = newPlayerTag.trim();

    if (!trimmedTag) {
      setError("Veuillez entrer le tag du joueur");
      return;
    }

    // Découper le tag sur le #
    const parts = trimmedTag.split("#");
    
    if (parts.length !== 2) {
      setError("Le tag doit être au format username#1234");
      return;
    }

    const [displayName, discriminator] = parts;

    if (!displayName.trim()) {
      setError("Le nom d'utilisateur ne peut pas être vide");
      return;
    }

    if (!discriminator.trim() || discriminator.length !== 4 || !/^\d{4}$/.test(discriminator)) {
      setError("Le discriminant doit être un nombre à 4 chiffres");
      return;
    }

    // Vérifier si le joueur n'est pas déjà dans la liste
    const existingPlayer = players.find(
      (p) =>
        p.displayName === displayName.trim() &&
        p.discriminator === discriminator.trim()
    );

    if (existingPlayer) {
      setError("Ce joueur est déjà dans la liste");
      return;
    }

    // Ajouter le joueur (l'ID sera résolu côté serveur si possible)
    const newPlayer: PlayerInput = {
      id: "", // Sera résolu côté serveur ou laissé vide
      username: trimmedTag,
      displayName: displayName.trim(),
      discriminator: discriminator.trim(),
    };

    setPlayers([...players, newPlayer]);
    setNewPlayerTag("");
    setError(null);
  };

  const removePlayer = (index: number) => {
    // Ne pas permettre de retirer le joueur courant (index 0)
    if (index === 0) {
      setError("Vous ne pouvez pas vous retirer de la partie");
      return;
    }
    setPlayers(players.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (players.length === 0) {
      setError("Au moins un joueur est requis");
      return;
    }

    startTransition(async () => {
      const result = await createGameMatchAction({
        gameId: formData.gameId,
        playedAt: new Date(formData.playedAt),
        lairId: formData.lairId || undefined,
        players: players.map((p) => ({
          userId: p.id || currentUser.id, // Utiliser l'ID courant si pas d'ID
          username: p.username,
          displayName: p.displayName,
          discriminator: p.discriminator,
        })),
      });

      if (result.success) {
        router.push("/game-matches");
      } else {
        setError(result.error || "Erreur lors de la création de la partie");
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

      {/* Jeu */}
      <div className="space-y-2">
        <label htmlFor="gameId" className="text-sm font-medium">
          Jeu <span className="text-destructive">*</span>
        </label>
        <Select
          value={formData.gameId}
          onValueChange={(value) => setFormData({ ...formData, gameId: value })}
        >
          <SelectTrigger id="gameId">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {games.map((game) => (
              <SelectItem key={game.id} value={game.id}>
                {game.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Date et heure */}
      <div className="space-y-2">
        <label htmlFor="playedAt" className="text-sm font-medium">
          Date et heure de la partie <span className="text-destructive">*</span>
        </label>
        <Input
          id="playedAt"
          type="datetime-local"
          required
          value={formData.playedAt}
          onChange={(e) => setFormData({ ...formData, playedAt: e.target.value })}
        />
      </div>

      {/* Lair (optionnel) */}
      <div className="space-y-2">
        <label htmlFor="lairId" className="text-sm font-medium">
          Lieu <span className="text-muted-foreground">(optionnel)</span>
        </label>
        <Select
          value={formData.lairId}
          onValueChange={(value) => setFormData({ ...formData, lairId: value })}
        >
          <SelectTrigger id="lairId">
            <SelectValue placeholder="Sélectionner un lieu (optionnel)" />
          </SelectTrigger>
          <SelectContent>
            {lairs.map((lair) => (
              <SelectItem key={lair.id} value={lair.id}>
                {lair.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Liste des joueurs */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          Joueurs <span className="text-destructive">*</span>
        </label>
        <div className="space-y-2">
          {players.map((player, index) => (
            <div
              key={index}
              className="flex items-center gap-2 p-2 border rounded-lg bg-muted/50"
            >
              <span className="flex-1 text-sm">{player.username}</span>
              {index > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePlayer(index)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {/* Ajouter un joueur */}
        <div className="space-y-2 pt-2">
          <div className="flex gap-2">
            <Input
              type="text"
              placeholder="username#1234"
              value={newPlayerTag}
              onChange={(e) => setNewPlayerTag(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={addPlayer} variant="outline">
              Ajouter
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Format : username#1234 (nom d'utilisateur suivi du # et d'un nombre à 4 chiffres)
          </p>
        </div>
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
          {isPending ? "Création en cours..." : "Enregistrer la partie"}
        </Button>
      </div>
    </form>
  );
}
