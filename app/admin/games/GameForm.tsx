"use client";

import { useState, useTransition } from "react";
import { GameType } from "@/lib/types/Game";
import { createGame } from "./actions";

export function GameForm() {
  const [showForm, setShowForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    icon: "",
    banner: "",
    description: "",
    type: "TCG" as GameType,
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    
    const formDataObj = new FormData();
    formDataObj.append("name", formData.name);
    formDataObj.append("icon", formData.icon);
    formDataObj.append("banner", formData.banner);
    formDataObj.append("description", formData.description);
    formDataObj.append("type", formData.type);

    startTransition(async () => {
      const result = await createGame(formDataObj);
      
      if (result.success) {
        setFormData({
          name: "",
          icon: "",
          banner: "",
          description: "",
          type: "TCG",
        });
        setShowForm(false);
      } else {
        setError(result.error || "Erreur lors de l'ajout du jeu");
      }
    });
  };

  return (
    <>
      <button
        onClick={() => setShowForm(!showForm)}
        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium"
      >
        {showForm ? "Annuler" : "Ajouter un jeu"}
      </button>

      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">Nouveau jeu</h2>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom du jeu
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
                Type de jeu
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as GameType,
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="TCG">TCG</option>
                <option value="BoardGame">Jeu de plateau</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL de l&apos;icône
              </label>
              <input
                type="url"
                required
                value={formData.icon}
                onChange={(e) =>
                  setFormData({ ...formData, icon: e.target.value })
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                required
                rows={4}
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium disabled:opacity-50"
            >
              {isPending ? "Ajout en cours..." : "Ajouter le jeu"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
