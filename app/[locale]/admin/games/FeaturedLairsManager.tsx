"use client";

import { useState, useEffect } from "react";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, MapPin } from "lucide-react";
import { updateGameFeaturedLairs } from "./actions";

export function FeaturedLairsManager({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const [lairs, setLairs] = useState<Lair[]>([]);
  const [selectedLairs, setSelectedLairs] = useState<string[]>(
    game.featuredLairs || []
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Charger les lieux disponibles
  useEffect(() => {
    if (open) {
      loadLairs();
    }
  }, [open]);

  const loadLairs = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/lairs?gameId=${game.id}`);
      if (!response.ok) throw new Error("Erreur lors du chargement des lieux");
      const data = await response.json();
      setLairs(data.lairs || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors du chargement"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleToggleLair = (lairId: string) => {
    setSelectedLairs((prev) =>
      prev.includes(lairId)
        ? prev.filter((id) => id !== lairId)
        : [...prev, lairId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await updateGameFeaturedLairs(game.id, selectedLairs);
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error || "Erreur lors de la sauvegarde");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erreur lors de la sauvegarde"
      );
    } finally {
      setSaving(false);
    }
  };

  const featuredLairsData = lairs.filter((lair) =>
    (game.featuredLairs || []).includes(lair.id)
  );

  const filteredLairs = lairs.filter((lair) =>
    lair.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-foreground">
          Lieux mis en avant
        </label>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Gérer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Gérer les lieux mis en avant</DialogTitle>
              <DialogDescription>
                Sélectionnez les lieux dont les événements seront affichés sur
                la page du jeu
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Rechercher un lieu..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2 border border-input rounded-lg focus:ring-2 focus:ring-ring focus:border-transparent"
              />

              {loading ? (
                <p className="text-center py-4 text-muted-foreground">
                  Chargement des lieux...
                </p>
              ) : filteredLairs.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground">
                  Aucun lieu trouvé pour ce jeu
                </p>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {filteredLairs.map((lair) => (
                    <div
                      key={lair.id}
                      onClick={() => handleToggleLair(lair.id)}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedLairs.includes(lair.id)
                          ? "bg-blue-500/10 border-blue-300"
                          : "bg-card border-border hover:border-input"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedLairs.includes(lair.id)}
                        onChange={() => {}}
                        className="h-4 w-4 text-blue-600 dark:text-blue-400 rounded"
                      />
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{lair.name}</p>
                        {lair.address && (
                          <p className="text-sm text-muted-foreground">{lair.address}</p>
                        )}
                      </div>
                      {lair.isPrivate && (
                        <Badge variant="secondary" className="text-xs">
                          Privé
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="flex-1"
              >
                Annuler
              </Button>
              <Button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1"
              >
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap gap-2">
        {featuredLairsData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun lieu mis en avant
          </p>
        ) : (
          featuredLairsData.map((lair) => (
            <Badge key={lair.id} variant="secondary" className="gap-1">
              <MapPin className="h-3 w-3" />
              {lair.name}
            </Badge>
          ))
        )}
      </div>
    </div>
  );
}

