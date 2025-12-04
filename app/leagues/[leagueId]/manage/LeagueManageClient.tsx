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
  Swords,
  Trophy,
  Calendar,
  Gamepad2,
  X,
} from "lucide-react";
import {
  updateLeagueAction,
  updateLeagueStatusAction,
  deleteLeagueAction,
  removeParticipantAction,
  addPointsAction,
  awardFeatAction,
  addLeagueMatchAction,
  deleteLeagueMatchAction,
} from "../../actions";
import { League, LeagueStatus, LeagueParticipant, Feat, LeagueMatch } from "@/lib/types/League";
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
  const [activeTab, setActiveTab] = useState<"settings" | "participants" | "points" | "matches">(
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

  // État pour l'édition des règles de points
  const [pointsRulesForm, setPointsRulesForm] = useState({
    participation: league.pointsConfig?.pointsRules.participation ?? 0,
    victory: league.pointsConfig?.pointsRules.victory ?? 2,
    defeat: league.pointsConfig?.pointsRules.defeat ?? 1,
  });

  // État pour l'édition des hauts faits
  const [featsForm, setFeatsForm] = useState<Feat[]>(
    league.pointsConfig?.pointsRules.feats || []
  );
  const [newFeat, setNewFeat] = useState<Omit<Feat, "id">>({
    title: "",
    description: "",
    points: 1,
    maxPerEvent: undefined,
    maxPerLeague: undefined,
  });

  // État pour le formulaire de nouveau match
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [matchForm, setMatchForm] = useState({
    gameId: league.gameIds[0] || "",
    playedAt: new Date().toISOString().slice(0, 16),
    playerIds: [] as string[],
    winnerIds: [] as string[],
    notes: "",
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

  const handleAddMatch = async () => {
    if (matchForm.playerIds.length < 2) {
      setError("Un match doit avoir au moins 2 joueurs");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await addLeagueMatchAction(league.id, {
        gameId: matchForm.gameId,
        playedAt: matchForm.playedAt,
        playerIds: matchForm.playerIds,
        winnerIds: matchForm.winnerIds,
        notes: matchForm.notes || undefined,
      });
      if (result.success) {
        setSuccess("Match enregistré avec succès");
        setMatchForm({ gameId: league.gameIds[0] || "", playedAt: new Date().toISOString().slice(0, 16), playerIds: [], winnerIds: [], notes: "" });
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'enregistrement du match");
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

  // Ajouter un nouveau haut fait
  const handleAddFeat = () => {
    if (!newFeat.title.trim()) {
      setError("Le titre du haut fait est requis");
      return;
    }
    const feat: Feat = {
      id: `feat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      title: newFeat.title.trim(),
      description: newFeat.description?.trim() || undefined,
      points: newFeat.points,
      maxPerEvent: newFeat.maxPerEvent,
      maxPerLeague: newFeat.maxPerLeague,
    };
    setFeatsForm([...featsForm, feat]);
    setNewFeat({
      title: "",
      description: "",
      points: 1,
      maxPerEvent: undefined,
      maxPerLeague: undefined,
    });
  };

  // Supprimer un haut fait
  const handleRemoveFeat = (featId: string) => {
    setFeatsForm(featsForm.filter((f) => f.id !== featId));
  };

  // Sauvegarder les règles de points
  const handleSavePointsRules = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updateLeagueAction(league.id, {
        format: "POINTS",
        pointsRules: {
          participation: pointsRulesForm.participation,
          victory: pointsRulesForm.victory,
          defeat: pointsRulesForm.defeat,
          feats: featsForm,
        },
      });
      if (result.success) {
        setSuccess("Règles de points sauvegardées");
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
        <Button
          variant={activeTab === "matches" ? "default" : "ghost"}
          onClick={() => setActiveTab("matches")}
        >
          <Swords className="h-4 w-4 mr-2" />
          Matchs ({league.matches?.length || 0})
        </Button>
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

          {/* Configuration des règles de points */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Configuration des règles de points</CardTitle>
              <CardDescription>
                Définissez les points attribués pour chaque action
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Points de participation
                  </label>
                  <Input
                    type="number"
                    value={pointsRulesForm.participation}
                    onChange={(e) =>
                      setPointsRulesForm({
                        ...pointsRulesForm,
                        participation: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">
                    Points pour chaque participation à un match
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Points de victoire
                  </label>
                  <Input
                    type="number"
                    value={pointsRulesForm.victory}
                    onChange={(e) =>
                      setPointsRulesForm({
                        ...pointsRulesForm,
                        victory: parseInt(e.target.value, 10) || 0,
                      })
                    }
                    min={0}
                  />
                  <p className="text-xs text-muted-foreground">
                    Points bonus pour une victoire
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Points de défaite
                  </label>
                  <Input
                    type="number"
                    value={pointsRulesForm.defeat}
                    onChange={(e) =>
                      setPointsRulesForm({
                        ...pointsRulesForm,
                        defeat: parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Points pour une défaite (généralement 0)
                  </p>
                </div>
              </div>

              {/* Liste des hauts faits */}
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Hauts faits</h4>
                
                {featsForm.length > 0 && (
                  <div className="space-y-2">
                    {featsForm.map((feat) => (
                      <div
                        key={feat.id}
                        className="flex items-center justify-between border rounded-lg p-3"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Trophy className="h-4 w-4 text-amber-500" />
                            <span className="font-medium">{feat.title}</span>
                            <Badge variant="secondary">+{feat.points} pts</Badge>
                          </div>
                          {feat.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {feat.description}
                            </p>
                          )}
                          <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                            {feat.maxPerEvent && (
                              <span>Max par match: {feat.maxPerEvent}</span>
                            )}
                            {feat.maxPerLeague && (
                              <span>Max par ligue: {feat.maxPerLeague}</span>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFeat(feat.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Formulaire d&apos;ajout de haut fait */}
                <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                  <h5 className="text-sm font-medium">Ajouter un haut fait</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Titre *</label>
                      <Input
                        value={newFeat.title}
                        onChange={(e) =>
                          setNewFeat({ ...newFeat, title: e.target.value })
                        }
                        placeholder="Ex: Premier sang"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Points</label>
                      <Input
                        type="number"
                        value={newFeat.points}
                        onChange={(e) =>
                          setNewFeat({
                            ...newFeat,
                            points: parseInt(e.target.value, 10) || 1,
                          })
                        }
                        min={1}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description</label>
                    <Input
                      value={newFeat.description || ""}
                      onChange={(e) =>
                        setNewFeat({ ...newFeat, description: e.target.value })
                      }
                      placeholder="Description du haut fait"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Max par match <span className="text-muted-foreground">(optionnel)</span>
                      </label>
                      <Input
                        type="number"
                        value={newFeat.maxPerEvent || ""}
                        onChange={(e) =>
                          setNewFeat({
                            ...newFeat,
                            maxPerEvent: e.target.value
                              ? parseInt(e.target.value, 10)
                              : undefined,
                          })
                        }
                        min={1}
                        placeholder="Illimité"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">
                        Max par ligue <span className="text-muted-foreground">(optionnel)</span>
                      </label>
                      <Input
                        type="number"
                        value={newFeat.maxPerLeague || ""}
                        onChange={(e) =>
                          setNewFeat({
                            ...newFeat,
                            maxPerLeague: e.target.value
                              ? parseInt(e.target.value, 10)
                              : undefined,
                          })
                        }
                        min={1}
                        placeholder="Illimité"
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={handleAddFeat}
                    disabled={!newFeat.title.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter le haut fait
                  </Button>
                </div>
              </div>

              <Button onClick={handleSavePointsRules} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <CheckCircle className="h-4 w-4 mr-2" />
                Sauvegarder les règles
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Matches */}
      {activeTab === "matches" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ajouter un match */}
          <Card>
            <CardHeader>
              <CardTitle>Ajouter un match</CardTitle>
              <CardDescription>
                Enregistrez un match entre participants de la ligue
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sélection du jeu */}
              {leagueGames.length > 0 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Jeu</label>
                  <Select
                    value={matchForm.gameId}
                    onValueChange={(value) =>
                      setMatchForm({ ...matchForm, gameId: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un jeu" />
                    </SelectTrigger>
                    <SelectContent>
                      {leagueGames.map((game) => (
                        <SelectItem key={game.id} value={game.id}>
                          {game.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date et heure du match */}
              <div className="space-y-2">
                <label htmlFor="matchPlayedAt" className="text-sm font-medium">
                  Date et heure
                </label>
                <Input
                  id="matchPlayedAt"
                  type="datetime-local"
                  value={matchForm.playedAt}
                  onChange={(e) =>
                    setMatchForm({ ...matchForm, playedAt: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Joueurs</label>
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                  {participantsWithUsers.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`player-${p.userId}`}
                        checked={matchForm.playerIds.includes(p.userId)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMatchForm({
                              ...matchForm,
                              playerIds: [...matchForm.playerIds, p.userId],
                            });
                          } else {
                            setMatchForm({
                              ...matchForm,
                              playerIds: matchForm.playerIds.filter(
                                (id) => id !== p.userId
                              ),
                              winnerIds: matchForm.winnerIds.filter(
                                (id) => id !== p.userId
                              ),
                            });
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                      <label htmlFor={`player-${p.userId}`} className="text-sm">
                        {p.user?.displayName || p.user?.username || p.userId}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {matchForm.playerIds.length >= 2 && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Gagnant(s) <span className="text-muted-foreground">(optionnel)</span>
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-2">
                    {matchForm.playerIds.map((playerId) => {
                      const player = participantsWithUsers.find(
                        (p) => p.userId === playerId
                      );
                      return (
                        <div key={playerId} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`winner-${playerId}`}
                            checked={matchForm.winnerIds.includes(playerId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMatchForm({
                                  ...matchForm,
                                  winnerIds: [...matchForm.winnerIds, playerId],
                                });
                              } else {
                                setMatchForm({
                                  ...matchForm,
                                  winnerIds: matchForm.winnerIds.filter(
                                    (id) => id !== playerId
                                  ),
                                });
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                          <label htmlFor={`winner-${playerId}`} className="text-sm">
                            {player?.user?.displayName ||
                              player?.user?.username ||
                              playerId}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <label htmlFor="matchNotes" className="text-sm font-medium">
                  Notes <span className="text-muted-foreground">(optionnel)</span>
                </label>
                <Textarea
                  id="matchNotes"
                  value={matchForm.notes}
                  onChange={(e) =>
                    setMatchForm({ ...matchForm, notes: e.target.value })
                  }
                  placeholder="Détails du match, score, etc."
                  rows={2}
                />
              </div>

              <Button
                onClick={handleAddMatch}
                disabled={loading || matchForm.playerIds.length < 2}
              >
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Swords className="h-4 w-4 mr-2" />
                Enregistrer le match
              </Button>
            </CardContent>
          </Card>

          {/* Historique des matchs */}
          <Card>
            <CardHeader>
              <CardTitle>Historique des matchs</CardTitle>
              <CardDescription>
                {league.matches?.length || 0} match(s) enregistré(s)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!league.matches || league.matches.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Aucun match enregistré pour cette ligue.
                </p>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {[...league.matches].reverse().map((match, index) => {
                    const matchPlayers = match.playerIds
                      .map((id) =>
                        participantsWithUsers.find((p) => p.userId === id)
                      )
                      .filter(Boolean);
                    const matchWinners = match.winnerIds
                      .map((id) =>
                        participantsWithUsers.find((p) => p.userId === id)
                      )
                      .filter(Boolean);

                    return (
                      <div
                        key={match.id || index}
                        className="border rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            Match #{league.matches!.length - index}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(match.playedAt).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Joueurs: </span>
                          {matchPlayers
                            .map(
                              (p) =>
                                p?.user?.displayName || p?.user?.username || p?.userId
                            )
                            .join(", ")}
                        </div>
                        {matchWinners.length > 0 && (
                          <div className="text-sm">
                            <span className="text-muted-foreground">Gagnant(s): </span>
                            <span className="text-green-600 font-medium">
                              {matchWinners
                                .map(
                                  (p) =>
                                    p?.user?.displayName ||
                                    p?.user?.username ||
                                    p?.userId
                                )
                                .join(", ")}
                            </span>
                          </div>
                        )}
                        {match.notes && (
                          <div className="text-sm text-muted-foreground">
                            {match.notes}
                          </div>
                        )}
                        {league.format === "POINTS" && (
                          <div className="text-xs text-muted-foreground">
                            Points attribués:{" "}
                            {match.winnerIds.length > 0
                              ? `+${league.pointsConfig?.pointsRules.victory || 3} victoire, +${league.pointsConfig?.pointsRules.participation || 1} participation`
                              : `+${league.pointsConfig?.pointsRules.participation || 1} participation`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
