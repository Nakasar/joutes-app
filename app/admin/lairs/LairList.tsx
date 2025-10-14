"use client";

import { useState, useTransition } from "react";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import { deleteLair } from "./actions";

export function LairList({
  lairs,
  games,
}: {
  lairs: Lair[];
  games: Game[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu ?")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteLair(id);

      if (!result.success) {
        setError(result.error || "Erreur lors de la suppression du lieu");
      }
    });
  };

  const getGameName = (gameId: string) => {
    return games.find((g) => g.id === gameId)?.name || gameId;
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
              Bannière
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Nom
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Jeux supportés
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {lairs.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                Aucun lieu pour le moment
              </td>
            </tr>
          ) : (
            lairs.map((lair) => (
              <tr key={lair.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <img
                    src={lair.banner}
                    alt={lair.name}
                    className="h-16 w-24 rounded object-cover"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {lair.name}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {lair.games.length === 0 ? (
                      <span className="text-sm text-gray-500">Aucun jeu</span>
                    ) : (
                      lair.games.map((gameId) => (
                        <span
                          key={gameId}
                          className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800"
                        >
                          {getGameName(gameId)}
                        </span>
                      ))
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button
                    onClick={() => handleDelete(lair.id)}
                    disabled={isPending}
                    className="text-red-600 hover:text-red-900 disabled:opacity-50"
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
