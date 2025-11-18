"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game";
import { deleteGame } from "./actions";
import { GameForm } from "./GameForm";
import { Button } from "@/components/ui/button";

const gameTypes = {
  TCG: "TCG",
  BoardGame: "Jeu de plateau",
  Other: 'Autre',
};

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

  return (
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      {error && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}
      
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Icône
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nom
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Type
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Description
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {games.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
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
                    <div className="h-10 w-10 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                      <span className="text-lg font-semibold">
                        {game.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {game.name}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {gameTypes[game.type] ?? 'Autre'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900 max-w-xs truncate">
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
                          className="text-blue-600 hover:text-blue-900"
                        >
                          Modifier
                        </Button>
                      }
                    />
                    <button
                      onClick={() => handleDelete(game.id)}
                      disabled={isPending}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
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
