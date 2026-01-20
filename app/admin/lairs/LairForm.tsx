"use client";

import { useState, useTransition, useEffect } from "react";
import { Game } from "@/lib/types/Game";
import { Lair, EventSource } from "@/lib/types/Lair";
import { createLair, updateLair } from "./actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarModeSwitch } from "./CalendarModeSwitch";

export function LairForm({
  games,
  lair,
  trigger,
}: {
  games: Game[];
  lair?: Lair;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    banner: "",
    games: [] as string[],
    eventsSourceUrls: [] as EventSource[],
    coordinates: "",
    address: "",
    website: "",
  });
  const [uploading, setUploading] = useState(false);

  // Initialiser ou réinitialiser le formulaire avec les données du lair
  useEffect(() => {
    if (open) {
      if (lair) {
        setFormData({
          name: lair.name,
          banner: lair.banner || "",
          games: lair.games || [],
          eventsSourceUrls: lair.eventsSourceUrls || [],
          coordinates: lair.location 
            ? `${lair.location.coordinates[1]}, ${lair.location.coordinates[0]}` 
            : "",
          address: lair.address || "",
          website: lair.website || "",
        });
      } else {
        setFormData({
          name: "",
          banner: "",
          games: [],
          eventsSourceUrls: [],
          coordinates: "",
          address: "",
          website: "",
        });
      }
      setError(null);
    }
  }, [open, lair]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const data: {
        name: string;
        banner?: string;
        games: string[];
        eventsSourceUrls: EventSource[];
        location?: { type: "Point"; coordinates: [number, number] };
        address?: string;
        website?: string;
      } = {
        name: formData.name,
        banner: formData.banner.length > 0 ? formData.banner : undefined,
        games: formData.games,
        eventsSourceUrls: formData.eventsSourceUrls.filter(source => source.url.trim() !== ""),
      };

      // Ajouter les coordonnées si le champ est rempli
      if (formData.coordinates.trim().length > 0) {
        const parts = formData.coordinates.split(',').map(s => s.trim());
        if (parts.length === 2) {
          const lat = parseFloat(parts[0]);
          const lon = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) {
            // Format GeoJSON : [longitude, latitude]
            data.location = {
              type: "Point",
              coordinates: [lon, lat]
            };
          }
        }
      }

      // Ajouter l'adresse si elle est remplie
      if (formData.address.trim().length > 0) {
        data.address = formData.address.trim();
      }

      // Ajouter le site web s'il est rempli
      if (formData.website.trim().length > 0) {
        data.website = formData.website.trim();
      }

      const result = lair
        ? await updateLair(lair.id, data)
        : await createLair(data);

      if (result.success) {
        setFormData({
          name: "",
          banner: "",
          games: [],
          eventsSourceUrls: [],
          coordinates: "",
          address: "",
          website: "",
        });
        setOpen(false);
      } else {
        setError(result.error || `Erreur lors de ${lair ? "la modification" : "l'ajout"} du lieu`);
      }
    });
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l'upload");
      }

      const data = await response.json();
      setFormData((prev) => ({ ...prev, banner: data.url }));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'upload du fichier"
      );
    } finally {
      setUploading(false);
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

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            Ajouter un lieu
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {lair ? "Modifier le lieu" : "Nouveau lieu de jeu"}
          </DialogTitle>
          <DialogDescription>
            {lair
              ? "Modifiez les informations du lieu de jeu."
              : "Ajoutez un nouveau lieu de jeu avec ses informations."}
          </DialogDescription>
        </DialogHeader>

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
              Bannière du lieu
            </label>
            <div className="space-y-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                disabled={uploading}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {uploading && (
                <p className="text-sm text-gray-500">Upload en cours...</p>
              )}
              {formData.banner && !uploading && (
                <div className="flex items-center gap-2">
                  <img
                    src={formData.banner}
                    alt="Bannière"
                    className="w-32 h-16 object-cover rounded"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({ ...formData, banner: "" })
                    }
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Supprimer
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Adresse (optionnel)
            </label>
            <input
              type="text"
              value={formData.address}
              onChange={(e) =>
                setFormData({ ...formData, address: e.target.value })
              }
              placeholder="123 rue de la Joute, 75001 Paris"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site web (optionnel)
            </label>
            <input
              type="url"
              value={formData.website}
              onChange={(e) =>
                setFormData({ ...formData, website: e.target.value })
              }
              placeholder="https://exemple.com"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Coordonnées GPS (optionnel)
            </label>
            <input
              type="text"
              value={formData.coordinates}
              onChange={(e) =>
                setFormData({ ...formData, coordinates: e.target.value })
              }
              placeholder="48.8566, 2.3522"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Format : latitude, longitude (exemple : 48.8566, 2.3522 pour Paris)
            </p>
          </div>

          {lair && (
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <CalendarModeSwitch lair={lair} />
            </div>
          )}

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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sources d&apos;événements
            </label>
            <div className="space-y-4">
              {formData.eventsSourceUrls.map((source, index) => (
                <div key={index} className="p-4 border border-gray-300 rounded-lg space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-gray-700">Source #{index + 1}</span>
                    <button
                      type="button"
                      onClick={() => {
                        const newSources = formData.eventsSourceUrls.filter((_, i) => i !== index);
                        setFormData({ ...formData, eventsSourceUrls: newSources });
                      }}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Retirer
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      URL de la source
                    </label>
                    <input
                      type="url"
                      value={source.url}
                      onChange={(e) => {
                        const newSources = [...formData.eventsSourceUrls];
                        newSources[index] = { ...newSources[index], url: e.target.value };
                        setFormData({ ...formData, eventsSourceUrls: newSources });
                      }}
                      placeholder="https://exemple.com/evenements"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Type de source
                    </label>
                    <select
                      value={source.type}
                      onChange={(e) => {
                        const newSources = [...formData.eventsSourceUrls];
                        const newType = e.target.value as 'IA' | 'MAPPING';
                        newSources[index] = { 
                          url: source.url, 
                          type: newType,
                          ...(newType === 'IA' ? { instructions: source.instructions || '' } : {}),
                          ...(newType === 'MAPPING' ? { mappingConfig: source.mappingConfig || { eventsPath: '', eventsFieldsMapping: {} } } : {})
                        };
                        setFormData({ ...formData, eventsSourceUrls: newSources });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    >
                      <option value="IA">IA (extraction intelligente)</option>
                      <option value="MAPPING">MAPPING (configuration JSON)</option>
                    </select>
                  </div>

                  {source.type === 'IA' && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">
                        Consignes pour l&apos;IA (optionnel)
                      </label>
                      <textarea
                        value={source.instructions || ''}
                        onChange={(e) => {
                          const newSources = [...formData.eventsSourceUrls];
                          newSources[index] = { ...newSources[index], instructions: e.target.value };
                          setFormData({ ...formData, eventsSourceUrls: newSources });
                        }}
                        placeholder="Instructions pour aider l&apos;IA à extraire les événements..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm resize-vertical"
                      />
                    </div>
                  )}

                  {source.type === 'MAPPING' && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Chemin vers les événements (JSONPath)
                        </label>
                        <input
                          type="text"
                          value={source.mappingConfig?.eventsPath || ''}
                          onChange={(e) => {
                            const newSources = [...formData.eventsSourceUrls];
                            newSources[index] = {
                              ...newSources[index],
                              mappingConfig: {
                                ...newSources[index].mappingConfig,
                                eventsPath: e.target.value,
                                eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                              },
                            };
                            setFormData({ ...formData, eventsSourceUrls: newSources });
                          }}
                          placeholder="events.data"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        />
                      </div>
                      <div className="text-xs text-gray-500">
                        <p className="mb-1 font-medium">Configuration du mapping des champs :</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['name', 'startDateTime', 'endDateTime', 'gameName', 'price', 'status', 'url'].map((field) => (
                            <div key={field}>
                              <label className="block text-xs text-gray-600 mb-1">
                                {field}
                              </label>
                              <input
                                type="text"
                                value={source.mappingConfig?.eventsFieldsMapping?.[field as keyof typeof source.mappingConfig.eventsFieldsMapping] || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: {
                                        ...newSources[index].mappingConfig?.eventsFieldsMapping,
                                        [field]: e.target.value,
                                      },
                                      eventsFieldsValues: newSources[index].mappingConfig?.eventsFieldsValues,
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder={field}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <p className="mb-2 text-xs font-medium text-gray-700">Valeurs par défaut (override) :</p>
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                name
                              </label>
                              <input
                                type="text"
                                value={source.mappingConfig?.eventsFieldsValues?.name || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        name: e.target.value || undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder="Nom par défaut"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                gameName
                              </label>
                              <input
                                type="text"
                                value={source.mappingConfig?.eventsFieldsValues?.gameName || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        gameName: e.target.value || undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder="Jeu par défaut"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                startDateTime
                              </label>
                              <input
                                type="text"
                                value={source.mappingConfig?.eventsFieldsValues?.startDateTime || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        startDateTime: e.target.value || undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder="Date/heure début"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                endDateTime
                              </label>
                              <input
                                type="text"
                                value={source.mappingConfig?.eventsFieldsValues?.endDateTime || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        endDateTime: e.target.value || undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder="Date/heure fin"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                price
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                value={source.mappingConfig?.eventsFieldsValues?.price || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        price: e.target.value ? parseFloat(e.target.value) : undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                placeholder="Prix par défaut"
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">
                                status
                              </label>
                              <select
                                value={source.mappingConfig?.eventsFieldsValues?.status || ''}
                                onChange={(e) => {
                                  const newSources = [...formData.eventsSourceUrls];
                                  newSources[index] = {
                                    ...newSources[index],
                                    mappingConfig: {
                                      eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                      eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                      eventsFieldsValues: {
                                        ...newSources[index].mappingConfig?.eventsFieldsValues,
                                        status: e.target.value ? e.target.value as 'available' | 'sold-out' | 'cancelled' : undefined,
                                      },
                                    },
                                  };
                                  setFormData({ ...formData, eventsSourceUrls: newSources });
                                }}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                              >
                                <option value="">-- Aucun --</option>
                                <option value="available">available</option>
                                <option value="sold-out">sold-out</option>
                                <option value="cancelled">cancelled</option>
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-600 mb-1">
                              url
                            </label>
                            <input
                              type="text"
                              value={source.mappingConfig?.eventsFieldsValues?.url || ''}
                              onChange={(e) => {
                                const newSources = [...formData.eventsSourceUrls];
                                newSources[index] = {
                                  ...newSources[index],
                                  mappingConfig: {
                                    eventsPath: newSources[index].mappingConfig?.eventsPath || '',
                                    eventsFieldsMapping: newSources[index].mappingConfig?.eventsFieldsMapping || {},
                                    eventsFieldsValues: {
                                      ...newSources[index].mappingConfig?.eventsFieldsValues,
                                      url: e.target.value || undefined,
                                    },
                                  },
                                };
                                setFormData({ ...formData, eventsSourceUrls: newSources });
                              }}
                              placeholder="URL par défaut"
                              className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                            />
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 italic">
                          Ces valeurs remplaceront celles issues du mapping JSON
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setFormData({
                    ...formData,
                    eventsSourceUrls: [
                      ...formData.eventsSourceUrls, 
                      { url: '', type: 'IA', instructions: '' }
                    ],
                  });
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                + Ajouter une source
              </button>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={isPending || uploading}
              className="flex-1"
            >
              {isPending
                ? (lair ? "Modification en cours..." : "Ajout en cours...")
                : (lair ? "Modifier" : "Ajouter")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
