"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game.ts";
import { deleteGame } from "./actions.ts";
import { GameForm } from "./GameForm.tsx";
import { Button } from "@/components/ui/button.tsx";
import {GAME_TYPES} from "@/lib/constants/game-types.ts";

export function GameList({ games }: { games: Game[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce jeu ?")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteGame(id);
      
      if (!result.success) {
        setError(result.error || "Erreur lors de la suppression du jeu");
      }
    });
  };

  // Le tableau est plus large qu'un téléphone : `overflow-x-auto` le laisse
  // défiler dans sa carte. `overflow-hidden` coupait les colonnes qui
  // dépassaient — la liste s'arrêtait au type du jeu, et rien ne permettait
  // d'aller voir sa description ni ses actions.
  return (
    <div className="bg-card rounded-lg shadow-md overflow-x-auto">
      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}
      
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Icône
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nom
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {games.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-4 text-center text-muted-foreground">
                Aucun jeu pour le moment
              </td>
            </tr>
          ) : (
            games.map((game) => (
              <tr key={game.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  {game.icon ? <img
                    src={game.icon}
                    alt={game.name}
                    className="h-10 w-10 rounded object-cover"
                  /> : (
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center text-muted-foreground">
                      <span className="text-lg font-semibold">
                        {game.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-foreground">
                    {game.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-500/15 text-blue-800 dark:text-blue-300">
                    {GAME_TYPES[game.type] ?? 'Autre'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-foreground max-w-xs truncate">
                    {game.description}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex gap-2 justify-end">
                    <GameForm
                      game={game}
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                          Modifier
                        </Button>
                      }
                    />
                    <button
                      onClick={() => handleDelete(game.id)}
                      disabled={isPending}
                      className="text-destructive hover:text-destructive/80 disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
