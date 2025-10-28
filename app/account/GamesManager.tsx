"use client";

import { Game } from "@/lib/types/Game";
import { useState, useTransition } from "react";
import { addGameToUserList, removeGameFromUserList } from "./actions";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gamepad2, Trash2, Plus, Loader2, AlertCircle } from "lucide-react";

interface GamesManagerProps {
  userGames: Game[];
  allGames: Game[];
}

export default function GamesManager({ userGames, allGames }: GamesManagerProps) {
  const [followedGames, setFollowedGames] = useState<Game[]>(userGames);
  const [isPending, startTransition] = useTransition();
  const [selectedGame, setSelectedGame] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const availableGames = allGames.filter(
    game => !followedGames.find(fg => fg.id === game.id)
  );

  const handleAddGame = () => {
    if (!selectedGame) return;

    const game = allGames.find(g => g.id === selectedGame);
    if (!game) return;

    startTransition(async () => {
      const result = await addGameToUserList(selectedGame);
      if (result.success) {
        setFollowedGames([...followedGames, game]);
        setSelectedGame("");
        setError(null);
      } else {
        setError(result.error || "Erreur lors de l'ajout du jeu");
      }
    });
  };

  const handleRemoveGame = (gameId: string) => {
    startTransition(async () => {
      const result = await removeGameFromUserList(gameId);
      if (result.success) {
        setFollowedGames(followedGames.filter(g => g.id !== gameId));
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la suppression du jeu");
      }
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Liste des jeux suivis */}
      {followedGames.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground space-y-2">
          <Gamepad2 className="h-12 w-12 mx-auto opacity-50" />
          <p>Vous ne suivez aucun jeu pour le moment.</p>
          <p className="text-sm">Ajoutez-en un ci-dessous !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {followedGames.map((game) => (
            <Card
              key={game.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 flex-1">
                  {game.icon && (
                    <div className="relative w-12 h-12 flex-shrink-0">
                      <Image
                        src={game.icon}
                        alt={game.name}
                        fill
                        className="object-contain rounded"
                      />
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{game.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{game.type}</p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleRemoveGame(game.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Formulaire d'ajout */}
      {availableGames.length > 0 && (
        <div className="border-t pt-6 space-y-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Ajouter un jeu
          </h3>
          <div className="flex gap-3">
            <Select value={selectedGame} onValueChange={setSelectedGame} disabled={isPending}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Sélectionnez un jeu..." />
              </SelectTrigger>
              <SelectContent>
                {availableGames.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name} ({game.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleAddGame}
              disabled={!selectedGame || isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ajout...
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Ajouter
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
