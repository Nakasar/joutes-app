"use client";

import { useState, useTransition } from "react";
import { Game } from "@/lib/types/Game";
import { createLair } from "./actions";

export function LairForm({
  games,
}: {
  games: Game[];
}) {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    banner: "",
    games: [] as string[],
    eventsSourceUrls: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createLair(formData);

      if (result.success) {
        setFormData({
          name: "",
          banner: "",
          games: [],
          eventsSourceUrls: [],
        });
        setShowForm(false);
      } else {
        setError(result.error || "Erreur lors de l'ajout du lieu");
      }
    });
  };

  const toggleGame = (gameId: string) => {
    setFormData({
      ...formData,
      games: formData.games.includes(gameId)
        ? formData.games.filter((id) => id !== gameId)
        : [...formData.games, gameId],
    });
  };

  return (
    <>
      <button
        onClick={() => setShowForm(!showForm)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
      >
        {showForm ? "Annuler" : "Ajouter un lieu"}
      </button>

      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Nouveau lieu de jeu</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du lieu
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL de la bannière
              </label>
              <input
                type="url"
                required
                value={formData.banner}
                onChange={(e) =>
                  setFormData({ ...formData, banner: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Jeux supportés
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {games.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Aucun jeu disponible. Ajoutez-en d&apos;abord dans la section
                    Jeux.
                  </p>
                ) : (
                  games.map((game) => (
                    <label
                      key={game.id}
                      className="flex items-center space-x-2 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.games.includes(game.id)}
                        onChange={() => toggleGame(game.id)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {game.name}
                      </span>
                    </label>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URLs des sources d&apos;événements
              </label>
              <div className="space-y-2">
                {formData.eventsSourceUrls.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const newUrls = [...formData.eventsSourceUrls];
                        newUrls[index] = e.target.value;
                        setFormData({ ...formData, eventsSourceUrls: newUrls });
                      }}
                      placeholder="https://exemple.com/evenements"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const newUrls = formData.eventsSourceUrls.filter((_, i) => i !== index);
                        setFormData({ ...formData, eventsSourceUrls: newUrls });
                      }}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      Retirer
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      eventsSourceUrls: [...formData.eventsSourceUrls, ""],
                    });
                  }}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  + Ajouter une URL
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isPending ? "Ajout en cours..." : "Ajouter le lieu"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
