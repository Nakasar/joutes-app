"use client";

import { useState, useTransition } from "react";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";
import { deleteLair, refreshEvents } from "./actions";
import { LairForm } from "./LairForm";
import { Button } from "@/components/ui/button";

export function LairList({
  lairs,
  games,
}: {
  lairs: Lair[];
  games: Game[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu ?")) return;

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await deleteLair(id);

      if (!result.success) {
        setError(result.error || "Erreur lors de la suppression du lieu");
      }
    });
  };
  
  const handleRefreshEvents = async (id: string) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await refreshEvents(id);

      if (result.success) {
        setSuccess(result.message || "Événements rafraîchis avec succès");
      } else {
        setError(result.error || "Erreur lors du rafraîchissement des événements");
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
      
      {success && (
        <div className="m-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {success}
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
                  {lair.banner ?
                  <img
                    src={lair.banner}
                    alt={lair.name}
                    className="h-16 w-24 rounded object-cover"
                  /> : (
                    <div className="h-16 w-24 rounded bg-gray-200 flex items-center justify-center text-gray-400">
                      <span className="text-lg font-semibold">
                        {lair.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
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
                  <div className="flex gap-2 justify-end">
                    {lair.eventsSourceUrls && lair.eventsSourceUrls.length > 0 && (
                      <button
                        onClick={() => handleRefreshEvents(lair.id)}
                        disabled={isPending}
                        className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        title="Rafraîchir les événements"
                      >
                        🔄 Rafraîchir
                      </button>
                    )}
                    <LairForm
                      games={games}
                      lair={lair}
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
                      onClick={() => handleDelete(lair.id)}
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
