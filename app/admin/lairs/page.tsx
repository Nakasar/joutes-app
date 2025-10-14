"use client";

import { useState, useEffect } from "react";
import { Lair } from "@/lib/types/Lair";
import { Game } from "@/lib/types/Game";

export default function AdminLairsPage() {
  const [lairs, setLairs] = useState<Lair[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    banner: "",
    games: [] as string[],
  });

  useEffect(() => {
    fetchLairs();
    fetchGames();
  }, []);

  const fetchLairs = async () => {
    try {
      const response = await fetch("/api/lairs");
      if (response.ok) {
        const data = await response.json();
        setLairs(data);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des lieux:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const response = await fetch("/api/games");
      if (response.ok) {
        const data = await response.json();
        setGames(data);
      }
    } catch (error) {
      console.error("Erreur lors du chargement des jeux:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/lairs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setFormData({
          name: "",
          banner: "",
          games: [],
        });
        setShowForm(false);
        fetchLairs();
      } else {
        alert("Erreur lors de l'ajout du lieu");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de l'ajout du lieu");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer ce lieu ?")) return;

    try {
      const response = await fetch(`/api/lairs/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        fetchLairs();
      } else {
        alert("Erreur lors de la suppression du lieu");
      }
    } catch (error) {
      console.error("Erreur:", error);
      alert("Erreur lors de la suppression du lieu");
    }
  };

  const toggleGame = (gameId: string) => {
    setFormData({
      ...formData,
      games: formData.games.includes(gameId)
        ? formData.games.filter((id) => id !== gameId)
        : [...formData.games, gameId],
    });
  };

  const getGameName = (gameId: string) => {
    return games.find((g) => g.id === gameId)?.name || gameId;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-6xl mx-auto">
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Gestion des Lieux de Jeu
          </h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
          >
            {showForm ? "Annuler" : "Ajouter un lieu"}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4">Nouveau lieu de jeu</h2>
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
                      Aucun jeu disponible. Ajoutez-en d'abord dans la section
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

              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium"
              >
                Ajouter le lieu
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
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
                          <span className="text-sm text-gray-500">
                            Aucun jeu
                          </span>
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
                        className="text-red-600 hover:text-red-900"
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
      </div>
    </div>
  );
}
