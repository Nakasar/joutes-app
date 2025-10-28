"use client";

import { Game } from "@/lib/types/Game";
import { useState, useTransition } from "react";
import { addGameToUserList, removeGameFromUserList } from "./actions";
import Image from "next/image";

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
    <div>
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* Liste des jeux suivis */}
      {followedGames.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Vous ne suivez aucun jeu pour le moment.</p>
          <p className="text-sm mt-2">Ajoutez-en un ci-dessous !</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {followedGames.map((game) => (
            <div
              key={game.id}
              className="border rounded-lg p-4 flex items-center justify-between hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3 flex-1">
                {game.icon && (
                  <div className="relative w-12 h-12 flex-shrink-0">
                    <Image
                      src={game.icon}
                      alt={game.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">{game.name}</h3>
                  <p className="text-sm text-gray-600">{game.type}</p>
                </div>
              </div>
              <button
                onClick={() => handleRemoveGame(game.id)}
                disabled={isPending}
                className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire d'ajout */}
      {availableGames.length > 0 && (
        <div className="border-t pt-6">
          <h3 className="font-semibold mb-3">Ajouter un jeu</h3>
          <div className="flex gap-3">
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              disabled={isPending}
              className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">Sélectionnez un jeu...</option>
              {availableGames.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name} ({game.type})
                </option>
              ))}
            </select>
            <button
              onClick={handleAddGame}
              disabled={!selectedGame || isPending}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Ajout..." : "Ajouter"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
