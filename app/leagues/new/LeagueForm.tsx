"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertCircle,
  Trophy,
  Plus,
  X,
  Target,
  Award,
  Loader2,
} from "lucide-react";
import { createLeagueAction } from "../actions";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { LeagueFormat, Feat } from "@/lib/types/League";

type LeagueFormProps = {
  games: Game[];
  lairs: Lair[];
};

export default function LeagueForm({ games, lairs }: LeagueFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    format: "POINTS" as LeagueFormat,
    isPublic: true,
    startDate: "",
    endDate: "",
    registrationDeadline: "",
    maxParticipants: "",
    minParticipants: "",
    gameIds: [] as string[],
    lairIds: [] as string[],
    // KILLER config
    killerTargets: "1",
    // POINTS config
    pointsParticipation: "0",
    pointsVictory: "2",
    pointsDefeat: "1",
    feats: [] as Feat[],
  });

  const [newFeat, setNewFeat] = useState({
    title: "",
    description: "",
    points: "1",
    maxPerEvent: "",
    maxPerLeague: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await createLeagueAction({
        name: formData.name,
        description: formData.description || undefined,
        format: formData.format,
        isPublic: formData.isPublic,
        gameIds: formData.gameIds,
        lairIds: formData.lairIds,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        registrationDeadline: formData.registrationDeadline || undefined,
        maxParticipants: formData.maxParticipants
          ? parseInt(formData.maxParticipants, 10)
          : undefined,
        minParticipants: formData.minParticipants
          ? parseInt(formData.minParticipants, 10)
          : undefined,
        killerTargets:
          formData.format === "KILLER"
            ? parseInt(formData.killerTargets, 10)
            : undefined,
        pointsRules:
          formData.format === "POINTS"
            ? {
                participation: parseInt(formData.pointsParticipation, 10) || 0,
                victory: parseInt(formData.pointsVictory, 10) || 2,
                defeat: parseInt(formData.pointsDefeat, 10) || 1,
                feats: formData.feats,
              }
            : undefined,
      });

      if (result.success && result.league) {
        router.push(`/leagues/${result.league.id}`);
        router.refresh();
      } else {
        setError(result.error || "Une erreur est survenue");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue lors de la création de la ligue");
    } finally {
      setLoading(false);
    }
  };

  const toggleGame = (gameId: string) => {
    setFormData((prev) => ({
      ...prev,
      gameIds: prev.gameIds.includes(gameId)
        ? prev.gameIds.filter((id) => id !== gameId)
        : [...prev.gameIds, gameId],
    }));
  };

  const toggleLair = (lairId: string) => {
    setFormData((prev) => ({
      ...prev,
      lairIds: prev.lairIds.includes(lairId)
        ? prev.lairIds.filter((id) => id !== lairId)
        : [...prev.lairIds, lairId],
    }));
  };

  const addFeat = () => {
    if (!newFeat.title) return;

    const feat: Feat = {
      id: `feat-${Date.now()}`,
      title: newFeat.title,
      description: newFeat.description || undefined,
      points: parseInt(newFeat.points, 10) || 1,
      maxPerEvent: newFeat.maxPerEvent
        ? parseInt(newFeat.maxPerEvent, 10)
        : undefined,
      maxPerLeague: newFeat.maxPerLeague
        ? parseInt(newFeat.maxPerLeague, 10)
        : undefined,
    };

    setFormData((prev) => ({
      ...prev,
      feats: [...prev.feats, feat],
    }));

    setNewFeat({
      title: "",
      description: "",
      points: "1",
      maxPerEvent: "",
      maxPerLeague: "",
    });
  };

  const removeFeat = (featId: string) => {
    setFormData((prev) => ({
      ...prev,
      feats: prev.feats.filter((f) => f.id !== featId),
    }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Créer une ligue
        </CardTitle>
        <CardDescription>
          Configurez votre ligue ou tournoi avec les paramètres de votre choix
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Informations générales */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Informations générales</h3>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium">
                Nom de la ligue *
              </label>
              <Input
                id="name"
                required
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ligue de printemps 2025"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Décrivez votre ligue..."
                rows={3}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label htmlFor="isPublic" className="text-sm font-medium">
                  Ligue publique
                </label>
                <p className="text-xs text-muted-foreground">
                  Les ligues publiques sont visibles par tous
                </p>
              </div>
              <Switch
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, isPublic: checked })
                }
              />
            </div>
          </div>

          {/* Format */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Format</h3>

            <div className="space-y-2">
              <label htmlFor="format" className="text-sm font-medium">
                Type de ligue *
              </label>
              <Select
                value={formData.format}
                onValueChange={(value: LeagueFormat) =>
                  setFormData({ ...formData, format: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="POINTS">
                    <div className="flex items-center gap-2">
                      <Award className="h-4 w-4" />
                      Points - Accumulez des points au fil des parties
                    </div>
                  </SelectItem>
                  <SelectItem value="KILLER">
                    <div className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Killer - Éliminez vos cibles
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Configuration KILLER */}
            {formData.format === "KILLER" && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <label
                      htmlFor="killerTargets"
                      className="text-sm font-medium"
                    >
                      Nombre de cibles par joueur
                    </label>
                    <Input
                      id="killerTargets"
                      type="number"
                      min="1"
                      max="5"
                      value={formData.killerTargets}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          killerTargets: e.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Chaque joueur aura ce nombre de cibles à affronter en
                      parallèle
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Configuration POINTS */}
            {formData.format === "POINTS" && (
              <Card className="bg-muted/50">
                <CardContent className="pt-4 space-y-4">
                  <h4 className="font-medium">Règles de points</h4>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label
                        htmlFor="pointsParticipation"
                        className="text-sm font-medium"
                      >
                        Participation
                      </label>
                      <Input
                        id="pointsParticipation"
                        type="number"
                        min="0"
                        value={formData.pointsParticipation}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            pointsParticipation: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="pointsVictory"
                        className="text-sm font-medium"
                      >
                        Victoire
                      </label>
                      <Input
                        id="pointsVictory"
                        type="number"
                        min="0"
                        value={formData.pointsVictory}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            pointsVictory: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <label
                        htmlFor="pointsDefeat"
                        className="text-sm font-medium"
                      >
                        Défaite
                      </label>
                      <Input
                        id="pointsDefeat"
                        type="number"
                        min="0"
                        value={formData.pointsDefeat}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            pointsDefeat: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>

                  {/* Hauts faits */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Hauts faits</h4>

                    {formData.feats.length > 0 && (
                      <div className="space-y-2">
                        {formData.feats.map((feat) => (
                          <div
                            key={feat.id}
                            className="flex items-center justify-between p-2 bg-background rounded border"
                          >
                            <div>
                              <span className="font-medium">{feat.title}</span>
                              <span className="text-muted-foreground ml-2">
                                (+{feat.points} pts)
                              </span>
                              {feat.description && (
                                <p className="text-xs text-muted-foreground">
                                  {feat.description}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeFeat(feat.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <Card className="bg-background">
                      <CardContent className="pt-4 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Titre</label>
                            <Input
                              placeholder="Nom du haut fait"
                              value={newFeat.title}
                              onChange={(e) =>
                                setNewFeat({
                                  ...newFeat,
                                  title: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">Points</label>
                            <Input
                              type="number"
                              min="0"
                              value={newFeat.points}
                              onChange={(e) =>
                                setNewFeat({
                                  ...newFeat,
                                  points: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium">
                            Description (optionnel)
                          </label>
                          <Input
                            placeholder="Description du haut fait"
                            value={newFeat.description}
                            onChange={(e) =>
                              setNewFeat({
                                ...newFeat,
                                description: e.target.value,
                              })
                            }
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs font-medium">
                              Max par événement
                            </label>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Illimité"
                              value={newFeat.maxPerEvent}
                              onChange={(e) =>
                                setNewFeat({
                                  ...newFeat,
                                  maxPerEvent: e.target.value,
                                })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium">
                              Max par ligue
                            </label>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Illimité"
                              value={newFeat.maxPerLeague}
                              onChange={(e) =>
                                setNewFeat({
                                  ...newFeat,
                                  maxPerLeague: e.target.value,
                                })
                              }
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addFeat}
                          disabled={!newFeat.title}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Ajouter le haut fait
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Dates */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Dates</h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <label htmlFor="startDate" className="text-sm font-medium">
                  Date de début
                </label>
                <Input
                  id="startDate"
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="endDate" className="text-sm font-medium">
                  Date de fin
                </label>
                <Input
                  id="endDate"
                  type="date"
                  value={formData.endDate}
                  onChange={(e) =>
                    setFormData({ ...formData, endDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="registrationDeadline"
                  className="text-sm font-medium"
                >
                  Date limite d&apos;inscription
                </label>
                <Input
                  id="registrationDeadline"
                  type="date"
                  value={formData.registrationDeadline}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      registrationDeadline: e.target.value,
                    })
                  }
                />
              </div>
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Participants</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="minParticipants" className="text-sm font-medium">
                  Minimum de participants
                </label>
                <Input
                  id="minParticipants"
                  type="number"
                  min="2"
                  value={formData.minParticipants}
                  onChange={(e) =>
                    setFormData({ ...formData, minParticipants: e.target.value })
                  }
                  placeholder="Pas de minimum"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="maxParticipants" className="text-sm font-medium">
                  Maximum de participants
                </label>
                <Input
                  id="maxParticipants"
                  type="number"
                  min="2"
                  value={formData.maxParticipants}
                  onChange={(e) =>
                    setFormData({ ...formData, maxParticipants: e.target.value })
                  }
                  placeholder="Pas de maximum"
                />
              </div>
            </div>
          </div>

          {/* Jeux */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Jeux</h3>
            <p className="text-sm text-muted-foreground">
              Sélectionnez les jeux autorisés dans cette ligue
            </p>

            <div className="flex flex-wrap gap-2">
              {games.map((game) => (
                <Badge
                  key={game.id}
                  variant={
                    formData.gameIds.includes(game.id) ? "default" : "outline"
                  }
                  className="cursor-pointer"
                  onClick={() => toggleGame(game.id)}
                >
                  {game.name}
                </Badge>
              ))}
            </div>
          </div>

          {/* Lieux partenaires */}
          {lairs.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Lieux partenaires</h3>
              <p className="text-sm text-muted-foreground">
                Sélectionnez les lieux partenaires de cette ligue (optionnel)
              </p>

              <div className="flex flex-wrap gap-2">
                {lairs.map((lair) => (
                  <Badge
                    key={lair.id}
                    variant={
                      formData.lairIds.includes(lair.id) ? "default" : "outline"
                    }
                    className="cursor-pointer"
                    onClick={() => toggleLair(lair.id)}
                  >
                    {lair.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Créer la ligue
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
