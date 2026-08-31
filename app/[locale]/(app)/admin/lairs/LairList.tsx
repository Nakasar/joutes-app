"use client";

import { useState, useTransition } from "react";
import { Lair } from "@/lib/types/Lair.ts";
import { Game } from "@/lib/types/Game.ts";
import { deleteLair, refreshEvents } from "./actions.ts";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

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

  // Comme la liste des jeux : le tableau défile dans sa carte plutôt que d'être
  // coupé à la largeur de l'écran.
  return (
    <div className="bg-card rounded-lg shadow-md overflow-x-auto">
      {error && (
        <div className="m-4 p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}
      
      {success && (
        <div className="m-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-700 dark:text-emerald-300 text-sm">
          {success}
        </div>
      )}
      
      <table className="min-w-full divide-y divide-border">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Bannière
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Nom
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Jeux supportés
            </th>
            <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-card divide-y divide-border">
          {lairs.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-6 py-4 text-center text-muted-foreground">
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
                    <div className="h-16 w-24 rounded bg-muted flex items-center justify-center text-muted-foreground">
                      <span className="text-lg font-semibold">
                        {lair.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <Link
                    href={`/admin/lairs/${lair.id}`}
                    className="text-sm font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {lair.name}
                  </Link>
                  {lair.address && (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                      {lair.address}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-1">
                    {lair.games.length === 0 ? (
                      <span className="text-sm text-muted-foreground">Aucun jeu</span>
                    ) : (
                      lair.games.map((gameId) => (
                        <span
                          key={gameId}
                          className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
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
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 disabled:opacity-50"
                        title="Rafraîchir les événements"
                      >
                        🔄 Rafraîchir
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      <Link href={`/admin/lairs/${lair.id}`}>Gérer</Link>
                    </Button>
                    <button
                      onClick={() => handleDelete(lair.id)}
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
