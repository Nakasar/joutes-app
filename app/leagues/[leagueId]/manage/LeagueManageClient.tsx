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
  Loader2,
  Users,
  Settings,
  Trash2,
  Play,
  CheckCircle,
  XCircle,
  Plus,
  UserMinus,
  Award,
} from "lucide-react";
import {
  updateLeagueAction,
  updateLeagueStatusAction,
  deleteLeagueAction,
  removeParticipantAction,
  addPointsAction,
  awardFeatAction,
} from "../../actions";
import { League, LeagueStatus, LeagueParticipant, Feat } from "@/lib/types/League";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import { User } from "@/lib/types/User";

type ParticipantWithUser = LeagueParticipant & { user: User | null };

type LeagueManageClientProps = {
  league: League;
  participantsWithUsers: ParticipantWithUser[];
  leagueGames: Game[];
  leagueLairs: Lair[];
  allGames: Game[];
  allLairs: Lair[];
};

const STATUS_LABELS: Record<LeagueStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Inscriptions ouvertes",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export default function LeagueManageClient({
  league,
  participantsWithUsers,
  leagueGames,
  leagueLairs,
  allGames,
  allLairs,
}: LeagueManageClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"settings" | "participants" | "points">(
    "settings"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: league.name,
    description: league.description || "",
    isPublic: league.isPublic,
    startDate: league.startDate
      ? new Date(league.startDate).toISOString().split("T")[0]
      : "",
    endDate: league.endDate
      ? new Date(league.endDate).toISOString().split("T")[0]
      : "",
    registrationDeadline: league.registrationDeadline
      ? new Date(league.registrationDeadline).toISOString().split("T")[0]
      : "",
    maxParticipants: league.maxParticipants?.toString() || "",
    minParticipants: league.minParticipants?.toString() || "",
    gameIds: league.gameIds,
    lairIds: league.lairIds,
  });

  // État pour l'ajout de points
  const [pointsForm, setPointsForm] = useState({
    userId: "",
    points: "",
    reason: "",
  });

  // État pour l'attribution de hauts faits
  const [featForm, setFeatForm] = useState({
    userId: "",
    featId: "",
  });

  const handleSaveSettings = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateLeagueAction(league.id, {
        name: formData.name,
        description: formData.description || undefined,
        isPublic: formData.isPublic,
        startDate: formData.startDate || undefined,
        endDate: formData.endDate || undefined,
        registrationDeadline: formData.registrationDeadline || undefined,
        maxParticipants: formData.maxParticipants
          ? parseInt(formData.maxParticipants, 10)
          : undefined,
        minParticipants: formData.minParticipants
          ? parseInt(formData.minParticipants, 10)
          : undefined,
        gameIds: formData.gameIds,
        lairIds: formData.lairIds,
      });

      if (result.success) {
        setSuccess("Paramètres sauvegardés");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de la sauvegarde");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: LeagueStatus) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateLeagueStatusAction(league.id, newStatus);
      if (result.success) {
        setSuccess(`Statut changé en "${STATUS_LABELS[newStatus]}"`);
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du changement de statut");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteLeague = async () => {
    if (
      !confirm(
        "Êtes-vous sûr de vouloir supprimer cette ligue ? Cette action est irréversible."
      )
    ) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await deleteLeagueAction(league.id);
      if (result.success) {
        router.push("/leagues");
      } else {
        setError(result.error || "Erreur lors de la suppression");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveParticipant = async (userId: string) => {
    if (!confirm("Êtes-vous sûr de vouloir retirer ce participant ?")) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await removeParticipantAction(league.id, userId);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error || "Erreur lors du retrait");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleAddPoints = async () => {
    if (!pointsForm.userId || !pointsForm.points || !pointsForm.reason) {
      setError("Veuillez remplir tous les champs");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await addPointsAction(
        league.id,
        pointsForm.userId,
        parseInt(pointsForm.points, 10),
        pointsForm.reason
      );
      if (result.success) {
        setSuccess("Points ajoutés");
        setPointsForm({ userId: "", points: "", reason: "" });
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'ajout de points");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleAwardFeat = async () => {
    if (!featForm.userId || !featForm.featId) {
      setError("Veuillez sélectionner un participant et un haut fait");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await awardFeatAction(
        league.id,
        featForm.userId,
        featForm.featId
      );
      if (result.success) {
        setSuccess("Haut fait attribué");
        setFeatForm({ userId: "", featId: "" });
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'attribution");
      }
    } catch (err) {
      console.error(err);
      setError("Une erreur est survenue");
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

  const feats = league.pointsConfig?.pointsRules.feats || [];

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {success && (
        <Alert className="border-green-500 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-700">{success}</AlertDescription>
        </Alert>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        <Button
          variant={activeTab === "settings" ? "default" : "ghost"}
          onClick={() => setActiveTab("settings")}
        >
          <Settings className="h-4 w-4 mr-2" />
          Paramètres
        </Button>
        <Button
          variant={activeTab === "participants" ? "default" : "ghost"}
          onClick={() => setActiveTab("participants")}
        >
          <Users className="h-4 w-4 mr-2" />
          Participants ({participantsWithUsers.length})
        </Button>
        {league.format === "POINTS" && (
          <Button
            variant={activeTab === "points" ? "default" : "ghost"}
            onClick={() => setActiveTab("points")}
          >
            <Award className="h-4 w-4 mr-2" />
            Points & Hauts faits
          </Button>
        )}
      </div>

      {/* Tab: Settings */}
      {activeTab === "settings" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Informations générales */}
          <Card>
            <CardHeader>
              <CardTitle>Informations générales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="name" className="text-sm font-medium">
                  Nom de la ligue
                </label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
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
                  rows={3}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <label htmlFor="isPublic" className="text-sm font-medium">
                    Ligue publique
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Visible par tous les utilisateurs
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

              <Button onClick={handleSaveSettings} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sauvegarder
              </Button>
            </CardContent>
          </Card>

          {/* Statut */}
          <Card>
            <CardHeader>
              <CardTitle>Statut de la ligue</CardTitle>
              <CardDescription>
                Statut actuel : <strong>{STATUS_LABELS[league.status]}</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {league.status === "DRAFT" && (
                  <Button
                    variant="outline"
                    onClick={() => handleStatusChange("OPEN")}
                    disabled={loading}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Ouvrir les inscriptions
                  </Button>
                )}
                {league.status === "OPEN" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => handleStatusChange("DRAFT")}
                      disabled={loading}
                    >
                      Repasser en brouillon
                    </Button>
                    <Button
                      onClick={() => handleStatusChange("IN_PROGRESS")}
                      disabled={loading}
                    >
                      <Play className="h-4 w-4 mr-2" />
                      Démarrer la ligue
                    </Button>
                  </>
                )}
                {league.status === "IN_PROGRESS" && (
                  <Button
                    onClick={() => handleStatusChange("COMPLETED")}
                    disabled={loading}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Terminer la ligue
                  </Button>
                )}
                {(league.status === "DRAFT" || league.status === "OPEN") && (
                  <Button
                    variant="destructive"
                    onClick={() => handleStatusChange("CANCELLED")}
                    disabled={loading}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Annuler
                  </Button>
                )}
              </div>

              {!league.isPublic && league.invitationCode && (
                <div className="pt-4 border-t">
                  <p className="text-sm font-medium mb-2">Code d&apos;invitation</p>
                  <code className="bg-muted px-3 py-2 rounded text-lg font-mono">
                    {league.invitationCode}
                  </code>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle>Dates</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="minParticipants" className="text-sm font-medium">
                    Min. participants
                  </label>
                  <Input
                    id="minParticipants"
                    type="number"
                    min="2"
                    value={formData.minParticipants}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        minParticipants: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="maxParticipants" className="text-sm font-medium">
                    Max. participants
                  </label>
                  <Input
                    id="maxParticipants"
                    type="number"
                    min="2"
                    value={formData.maxParticipants}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxParticipants: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <Button onClick={handleSaveSettings} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sauvegarder
              </Button>
            </CardContent>
          </Card>

          {/* Jeux et Lieux */}
          <Card>
            <CardHeader>
              <CardTitle>Jeux et Lieux</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Jeux</label>
                <div className="flex flex-wrap gap-2">
                  {allGames.map((game) => (
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

              {allLairs.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Lieux partenaires</label>
                  <div className="flex flex-wrap gap-2">
                    {allLairs.map((lair) => (
                      <Badge
                        key={lair.id}
                        variant={
                          formData.lairIds.includes(lair.id)
                            ? "default"
                            : "outline"
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

              <Button onClick={handleSaveSettings} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Sauvegarder
              </Button>
            </CardContent>
          </Card>

          {/* Zone de danger */}
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-destructive">Zone de danger</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                onClick={handleDeleteLeague}
                disabled={loading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer la ligue
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Participants */}
      {activeTab === "participants" && (
        <Card>
          <CardHeader>
            <CardTitle>Participants ({participantsWithUsers.length})</CardTitle>
            <CardDescription>
              Gérez les participants de votre ligue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {participantsWithUsers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Aucun participant pour le moment
              </p>
            ) : (
              <div className="space-y-2">
                {participantsWithUsers.map((participant) => (
                  <div
                    key={participant.userId}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {participant.user?.avatar && (
                        <img
                          src={participant.user.avatar}
                          alt=""
                          className="h-10 w-10 rounded-full"
                        />
                      )}
                      <div>
                        <span className="font-medium">
                          {participant.user?.displayName ||
                            participant.user?.username ||
                            "Utilisateur inconnu"}
                        </span>
                        <div className="text-sm text-muted-foreground">
                          Inscrit le{" "}
                          {new Date(participant.joinedAt).toLocaleDateString(
                            "fr-FR"
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold">{participant.points} pts</span>
                      {participant.userId !== league.creatorId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleRemoveParticipant(participant.userId)
                          }
                          disabled={loading}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab: Points & Feats */}
      {activeTab === "points" && league.format === "POINTS" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ajouter des points */}
          <Card>
            <CardHeader>
              <CardTitle>Ajouter des points</CardTitle>
              <CardDescription>
                Ajoutez des points manuellement à un participant
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Participant</label>
                <Select
                  value={pointsForm.userId}
                  onValueChange={(value) =>
                    setPointsForm({ ...pointsForm, userId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un participant" />
                  </SelectTrigger>
                  <SelectContent>
                    {participantsWithUsers.map((p) => (
                      <SelectItem key={p.userId} value={p.userId}>
                        {p.user?.displayName || p.user?.username || p.userId}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Points</label>
                <Input
                  type="number"
                  value={pointsForm.points}
                  onChange={(e) =>
                    setPointsForm({ ...pointsForm, points: e.target.value })
                  }
                  placeholder="Nombre de points (peut être négatif)"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Raison</label>
                <Input
                  value={pointsForm.reason}
                  onChange={(e) =>
                    setPointsForm({ ...pointsForm, reason: e.target.value })
                  }
                  placeholder="Victoire, participation, bonus..."
                />
              </div>

              <Button onClick={handleAddPoints} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Plus className="h-4 w-4 mr-2" />
                Ajouter les points
              </Button>
            </CardContent>
          </Card>

          {/* Attribuer un haut fait */}
          {feats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Attribuer un haut fait</CardTitle>
                <CardDescription>
                  Attribuez un haut fait à un participant
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Participant</label>
                  <Select
                    value={featForm.userId}
                    onValueChange={(value) =>
                      setFeatForm({ ...featForm, userId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un participant" />
                    </SelectTrigger>
                    <SelectContent>
                      {participantsWithUsers.map((p) => (
                        <SelectItem key={p.userId} value={p.userId}>
                          {p.user?.displayName || p.user?.username || p.userId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Haut fait</label>
                  <Select
                    value={featForm.featId}
                    onValueChange={(value) =>
                      setFeatForm({ ...featForm, featId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un haut fait" />
                    </SelectTrigger>
                    <SelectContent>
                      {feats.map((feat) => (
                        <SelectItem key={feat.id} value={feat.id}>
                          {feat.title} (+{feat.points} pts)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={handleAwardFeat} disabled={loading}>
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  <Award className="h-4 w-4 mr-2" />
                  Attribuer
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
