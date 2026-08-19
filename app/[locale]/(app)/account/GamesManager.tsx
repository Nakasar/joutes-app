"use client";

import { Game } from "@/lib/types/Game.ts";
import { useState, useTransition } from "react";
import { addGameToUserList, removeGameFromUserList, setFavoriteGameAction } from "./actions.ts";
import { notifyGamesChanged } from "@/lib/games/games-changed.ts";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Gamepad2, Trash2, Plus, Loader2, AlertCircle, Star } from "lucide-react";

interface GamesManagerProps {
  userGames: Game[];
  allGames: Game[];
  /** Jeux mis en avant dans le menu de navigation, parmi ceux qui sont suivis. */
  favoriteGameIds: string[];
}

export default function GamesManager({ userGames, allGames, favoriteGameIds }: GamesManagerProps) {
  const [followedGames, setFollowedGames] = useState<Game[]>(userGames);
  const [favorites, setFavorites] = useState<string[]>(favoriteGameIds);
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
        setFollowedGames(current => [...current, game]);
        setSelectedGame("");
        setError(null);
        notifyGamesChanged();
      } else {
        setError(result.error || "Erreur lors de l'ajout du jeu");
      }
    });
  };

  const handleRemoveGame = (gameId: string) => {
    startTransition(async () => {
      const result = await removeGameFromUserList(gameId);
      if (result.success) {
        // Mises à jour fonctionnelles : deux retraits lancés coup sur coup
        // partiraient sinon du même état capturé, et le second effacerait le
        // premier.
        setFollowedGames(current => current.filter(g => g.id !== gameId));
        // Le serveur retire aussi le favori : ne pas le refléter ici laisserait
        // une étoile allumée sur un jeu qui n'est plus dans la liste.
        setFavorites(current => current.filter(id => id !== gameId));
        setError(null);
        notifyGamesChanged();
      } else {
        setError(result.error || "Erreur lors de la suppression du jeu");
      }
    });
  };

  const handleToggleFavorite = (gameId: string) => {
    const favorite = !favorites.includes(gameId);
    // Affichage optimiste : l'étoile doit répondre au doigt. Le serveur peut
    // refuser (jeu qui n'est plus suivi), auquel cas on revient en arrière.
    setFavorites(current =>
      favorite ? [...current, gameId] : current.filter(id => id !== gameId)
    );

    startTransition(async () => {
      const result = await setFavoriteGameAction(gameId, favorite);
      if (result.success) {
        setError(null);
        notifyGamesChanged();
        return;
      }
      setFavorites(current =>
        favorite ? current.filter(id => id !== gameId) : [...current, gameId]
      );
      setError(result.error || "Erreur lors de la mise en favori");
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

      {/* Les favoris commandent le menu de navigation : sans explication,
          l'étoile passerait pour une décoration. */}
      {followedGames.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Mettez en favori les jeux que vous voulez retrouver dans le menu
          &laquo;&nbsp;Jeux&nbsp;&raquo;. Sans favori, ce sont tous vos jeux suivis qui y
          figurent.
        </p>
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
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant={favorites.includes(game.id) ? "default" : "outline"}
                    size="icon"
                    onClick={() => handleToggleFavorite(game.id)}
                    disabled={isPending}
                    aria-pressed={favorites.includes(game.id)}
                    aria-label={
                      favorites.includes(game.id)
                        ? `Retirer ${game.name} des favoris`
                        : `Mettre ${game.name} en favori`
                    }
                    title={
                      favorites.includes(game.id)
                        ? "Retirer des favoris"
                        : "Mettre en favori"
                    }
                  >
                    <Star
                      className={`h-4 w-4 ${favorites.includes(game.id) ? "fill-current" : ""}`}
                    />
                  </Button>
                  <Button
                    variant="destructive"
                    size="icon"
                    onClick={() => handleRemoveGame(game.id)}
                    disabled={isPending}
                    aria-label={`Ne plus suivre ${game.name}`}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
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
