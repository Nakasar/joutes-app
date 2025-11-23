"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, TournamentPhase, MatchResult, Announcement } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { 
  Settings, 
  Users, 
  Trophy, 
  PlayCircle, 
  Megaphone, 
  Plus,
  Edit,
  Trash2,
  Check,
  AlertCircle,
  UserPlus
} from "lucide-react";
import {
  createOrUpdatePortalSettings,
  addPhase,
  updatePhaseStatus,
  setCurrentPhase,
  getMatchResults,
  createMatchResult,
  updateMatchResult,
  deleteMatchResult,
  getAnnouncements,
  createAnnouncement,
  deleteAnnouncement,
  generateMatchesForPhase,
  getPhaseStandings,
} from "./actions";
import { getEventParticipants } from "./participant-actions";
import AddParticipantForm from "../AddParticipantForm";
import BracketView from "./BracketView";

type OrganizerPortalProps = {
  event: Event;
  settings: EventPortalSettings | null;
  userId: string;
  selectedPhaseId?: string;
  selectedRound?: string;
};

export default function OrganizerPortal({ event, settings: initialSettings, userId, selectedPhaseId, selectedRound }: OrganizerPortalProps) {
  const pathname = usePathname();
  
  // Déterminer l'onglet actif depuis l'URL
  const getActiveTab = (): "settings" | "participants" | "matches" | "announcements" => {
    if (pathname?.includes("/participants")) return "participants";
    if (pathname?.includes("/matches")) return "matches";
    if (pathname?.includes("/announcements")) return "announcements";
    return "settings";
  };

  const [settings, setSettings] = useState<EventPortalSettings | null>(initialSettings);
  const activeTab = getActiveTab();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // États pour les formulaires
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchResult | null>(null);

  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [matchesLoaded, setMatchesLoaded] = useState(false);
  const [announcementsLoaded, setAnnouncementsLoaded] = useState(false);
  const [participantsLoaded, setParticipantsLoaded] = useState(false);

  // Formulaire de phase
  const [phaseForm, setPhaseForm] = useState({
    name: "",
    type: "swiss" as "swiss" | "bracket",
    matchType: "BO3" as "BO1" | "BO2" | "BO3" | "BO5",
    rounds: 3,
    topCut: 8,
    order: 0,
  });

  // Formulaire de match
  const [matchForm, setMatchForm] = useState({
    phaseId: "",
    player1Id: "",
    player2Id: "",
    player1Score: 0,
    player2Score: 0,
    round: 1,
  });

  // Formulaire d&apos;annonce
  const [announcementForm, setAnnouncementForm] = useState({
    message: "",
    priority: "normal" as "normal" | "important" | "urgent",
  });

  // Charger les matchs si pas encore fait
  const loadMatches = async () => {
    if (matchesLoaded) return;
    startTransition(async () => {
      const result = await getMatchResults(event.id);
      if (result.success && result.data) {
        setMatches(result.data as MatchResult[]);
        setMatchesLoaded(true);
      }
    });
  };

  // Charger les annonces si pas encore fait
  const loadAnnouncements = async () => {
    if (announcementsLoaded) return;
    startTransition(async () => {
      const result = await getAnnouncements(event.id);
      if (result.success && result.data) {
        setAnnouncements(result.data as Announcement[]);
        setAnnouncementsLoaded(true);
      }
    });
  };

  // Charger les participants si pas encore fait
  const loadParticipants = async () => {
    if (participantsLoaded) return;
    startTransition(async () => {
      const result = await getEventParticipants(event.id);
      if (result.success && result.data) {
        setParticipants(result.data);
        setParticipantsLoaded(true);
      }
    });
  };

  // Initialiser les paramètres du portail
  const handleInitializeSettings = () => {
    startTransition(async () => {
      setError(null);
      const result = await createOrUpdatePortalSettings({
        eventId: event.id,
        phases: [],
        allowSelfReporting: true,
        requireConfirmation: true,
      });

      if (result.success && result.data) {
        setSettings(result.data as EventPortalSettings);
        setSuccess("Paramètres initialisés avec succès");
      } else {
        setError(result.error || "Erreur lors de l&apos;initialisation");
      }
    });
  };

  // Ajouter une phase
  const handleAddPhase = () => {
    if (!settings) return;
    
    startTransition(async () => {
      setError(null);
      const result = await addPhase(event.id, phaseForm);

      if (result.success) {
        // Recharger les paramètres
        const settingsResult = await createOrUpdatePortalSettings({
          eventId: event.id,
          phases: [...settings.phases, result.data as TournamentPhase],
          currentPhaseId: settings.currentPhaseId,
          allowSelfReporting: settings.allowSelfReporting,
          requireConfirmation: settings.requireConfirmation,
        });
        
        if (settingsResult.success && settingsResult.data) {
          setSettings(settingsResult.data as EventPortalSettings);
          setSuccess("Phase ajoutée avec succès");
          setShowPhaseForm(false);
          setPhaseForm({
            name: "",
            type: "swiss",
            matchType: "BO3",
            rounds: 3,
            topCut: 8,
            order: settings.phases.length,
          });
        }
      } else {
        setError(result.error || "Erreur lors de l&apos;ajout de la phase");
      }
    });
  };

  // Changer le statut d&apos;une phase
  const handleUpdatePhaseStatus = (phaseId: string, status: "not-started" | "in-progress" | "completed") => {
    startTransition(async () => {
      setError(null);
      const result = await updatePhaseStatus(event.id, phaseId, status);

      if (result.success && settings) {
        const updatedPhases = settings.phases.map(p =>
          p.id === phaseId ? { ...p, status } : p
        );
        setSettings({ ...settings, phases: updatedPhases });
        setSuccess("Statut de la phase mis à jour");
      } else {
        setError(result.error || "Erreur lors de la mise à jour");
      }
    });
  };

  // Définir la phase courante
  const handleSetCurrentPhase = (phaseId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await setCurrentPhase(event.id, phaseId);

      if (result.success && settings) {
        setSettings({ ...settings, currentPhaseId: phaseId });
        setSuccess("Phase courante définie");
      } else {
        setError(result.error || "Erreur lors de la définition de la phase courante");
      }
    });
  };

  // Créer un match
  const handleCreateMatch = () => {
    startTransition(async () => {
      setError(null);
      const matchId = `match-${Date.now()}`;
      const winnerId = matchForm.player1Score > matchForm.player2Score 
        ? matchForm.player1Id 
        : matchForm.player2Score > matchForm.player1Score
          ? matchForm.player2Id
          : undefined;

      // Mise à jour optimiste
      const optimisticMatch: MatchResult = {
        ...matchForm,
        matchId,
        winnerId,
        status: 'completed',
        reportedBy: userId,
        confirmedBy: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setMatches([...matches, optimisticMatch]);

      const result = await createMatchResult(event.id, {
        ...matchForm,
        matchId,
        winnerId,
      });

      if (result.success && result.data) {
        // Remplacer le match optimiste par le vrai
        setMatches(prev => prev.map(m => m.matchId === matchId ? result.data as MatchResult : m));
        setSuccess("Match créé avec succès");
        setShowMatchForm(false);
        setMatchForm({
          phaseId: "",
          player1Id: "",
          player2Id: "",
          player1Score: 0,
          player2Score: 0,
          round: 1,
        });
      } else {
        setError(result.error || "Erreur lors de la création du match");
      }
    });
  };

  // Supprimer un match
  const handleDeleteMatch = (matchId: string) => {
    startTransition(async () => {
      setError(null);
      
      // Mise à jour optimiste
      setMatches(matches.filter(m => m.matchId !== matchId));
      
      const result = await deleteMatchResult(event.id, matchId);

      if (result.success) {
        setSuccess("Match supprimé avec succès");
      } else {
        setError(result.error || "Erreur lors de la suppression du match");
      }
    });
  };

  // Éditer un match existant
  const handleEditMatch = (match: MatchResult) => {
    setEditingMatch(match);
  };

  // Sauvegarder les modifications d'un match
  const handleSaveMatchEdit = () => {
    if (!editingMatch) return;

    startTransition(async () => {
      setError(null);
      const winnerId = editingMatch.player1Score > editingMatch.player2Score
        ? editingMatch.player1Id
        : editingMatch.player2Score > editingMatch.player1Score
          ? editingMatch.player2Id
          : undefined;

      // Mise à jour optimiste
      const updatedMatch: MatchResult = {
        ...editingMatch,
        winnerId: winnerId || undefined,
        status: 'completed' as const,
        reportedBy: userId,
        confirmedBy: userId,
        updatedAt: new Date().toISOString(),
      };
      setMatches(matches.map(m => m.matchId === editingMatch.matchId ? updatedMatch : m));
      setEditingMatch(null);

      const result = await updateMatchResult(event.id, editingMatch.matchId, {
        matchId: editingMatch.matchId,
        player1Score: editingMatch.player1Score,
        player2Score: editingMatch.player2Score,
        winnerId,
        status: "completed",
      });

      if (result.success) {
        setSuccess("Résultat du match mis à jour");
      } else {
        setError(result.error || "Erreur lors de la mise à jour du match");
      }
    });
  };

  // Générer les matchs pour une phase
  const handleGenerateMatches = (phaseId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await generateMatchesForPhase(event.id, phaseId);

      if (result.success && result.data) {
        // Mise à jour optimiste : ajouter les nouveaux matchs
        const newMatches = result.data.matches || [];
        setMatches([...matches, ...newMatches as MatchResult[]]);
        setSuccess(`${result.data.matchesCreated} match(s) généré(s) pour la ronde ${result.data.roundNumber}`);
      } else {
        setError(result.error || "Erreur lors de la génération des matchs");
      }
    });
  };

  // Créer une annonce
  const handleCreateAnnouncement = () => {
    startTransition(async () => {
      setError(null);
      const result = await createAnnouncement(event.id, announcementForm);

      if (result.success && result.data) {
        setAnnouncements([result.data as Announcement, ...announcements]);
        setSuccess("Annonce créée avec succès");
        setShowAnnouncementForm(false);
        setAnnouncementForm({
          message: "",
          priority: "normal",
        });
      } else {
        setError(result.error || "Erreur lors de la création de l'annonce");
      }
    });
  };

  // Supprimer une annonce
  const handleDeleteAnnouncement = (announcementId: string) => {
    startTransition(async () => {
      setError(null);
      const result = await deleteAnnouncement(event.id, announcementId);

      if (result.success) {
        setAnnouncements(announcements.filter(a => a.id !== announcementId));
        setSuccess("Annonce supprimée avec succès");
      } else {
        setError(result.error || "Erreur lors de la suppression de l'annonce");
      }
    });
  };

  // Obtenir le nom d'un participant
  const getParticipantName = (playerId: string | null) => {
    if (playerId === null) return "BYE";
    const participant = participants.find(p => p.id === playerId);
    if (!participant) return playerId.slice(-6);
    return participant.discriminator 
      ? `${participant.username}#${participant.discriminator}`
      : participant.username;
  };

  // Charger les données au montage selon l'onglet actif
  useEffect(() => {
    if (activeTab === "participants") loadParticipants();
    if (activeTab === "matches") {
      loadMatches();
      loadParticipants();
    }
    if (activeTab === "announcements") loadAnnouncements();
  }, [activeTab]);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Portail Organisateur</h1>
        <p className="text-muted-foreground">{event.name}</p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="mb-4">
          <Check className="h-4 w-4" />
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Navigation */}
      <div className="flex gap-2 mb-6 border-b">
        <Link href={`/events/${event.id}/portal/organizer`}>
          <Button
            variant={activeTab === "settings" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Settings className="h-4 w-4 mr-2" />
            Paramètres
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/participants`}>
          <Button
            variant={activeTab === "participants" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Participants
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/matches`}>
          <Button
            variant={activeTab === "matches" ? "default" : "ghost"}
            className="rounded-b-none"
            disabled={!settings}
          >
            <Trophy className="h-4 w-4 mr-2" />
            Matchs
          </Button>
        </Link>
        <Link href={`/events/${event.id}/portal/organizer/announcements`}>
          <Button
            variant={activeTab === "announcements" ? "default" : "ghost"}
            className="rounded-b-none"
          >
            <Megaphone className="h-4 w-4 mr-2" />
            Annonces
          </Button>
        </Link>
      </div>

      {/* Contenu des tabs */}
      {activeTab === "settings" && (
        <div className="space-y-6">
          {!settings ? (
            <Card>
              <CardHeader>
                <CardTitle>Initialiser le portail</CardTitle>
                <CardDescription>
                  Commencez par initialiser les paramètres du portail pour votre événement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleInitializeSettings} disabled={isPending}>
                  <PlayCircle className="h-4 w-4 mr-2" />
                  Initialiser le portail
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Phases du tournoi</CardTitle>
                      <CardDescription>
                        Gérez les différentes phases de votre tournoi
                      </CardDescription>
                    </div>
                    <Button onClick={() => setShowPhaseForm(!showPhaseForm)} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Ajouter une phase
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {showPhaseForm && (
                    <div className="border rounded-lg p-4 space-y-4">
                      <div>
                        <label className="text-sm font-medium">Nom de la phase</label>
                        <Input
                          value={phaseForm.name}
                          onChange={(e) => setPhaseForm({ ...phaseForm, name: e.target.value })}
                          placeholder="Ex: Rondes suisses"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Type</label>
                        <select
                          className="w-full border rounded-md p-2"
                          value={phaseForm.type}
                          onChange={(e) => setPhaseForm({ ...phaseForm, type: e.target.value as "swiss" | "bracket" })}
                        >
                          <option value="swiss">Rondes suisses</option>
                          <option value="bracket">Élimination directe</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Format de match</label>
                        <select
                          className="w-full border rounded-md p-2"
                          value={phaseForm.matchType}
                          onChange={(e) => setPhaseForm({ ...phaseForm, matchType: e.target.value as any })}
                        >
                          <option value="BO1">BO1</option>
                          <option value="BO2">BO2</option>
                          <option value="BO3">BO3</option>
                          <option value="BO5">BO5</option>
                        </select>
                      </div>
                      {phaseForm.type === "swiss" && (
                        <div>
                          <label className="text-sm font-medium">Nombre de rondes</label>
                          <Input
                            type="number"
                            min="1"
                            value={phaseForm.rounds}
                            onChange={(e) => setPhaseForm({ ...phaseForm, rounds: parseInt(e.target.value) })}
                          />
                        </div>
                      )}
                      {phaseForm.type === "bracket" && (
                        <div>
                          <label className="text-sm font-medium">Nombre de joueurs (Top Cut)</label>
                          <Input
                            type="number"
                            min="2"
                            step="1"
                            value={phaseForm.topCut}
                            onChange={(e) => setPhaseForm({ ...phaseForm, topCut: parseInt(e.target.value) })}
                            placeholder="Ex: 8 pour un top 8"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Nombre de joueurs à prendre du classement (4, 8, 16, 32, etc.)
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button onClick={handleAddPhase} disabled={isPending || !phaseForm.name}>
                          Ajouter
                        </Button>
                        <Button variant="outline" onClick={() => setShowPhaseForm(false)}>
                          Annuler
                        </Button>
                      </div>
                    </div>
                  )}

                  {settings.phases.length === 0 ? (
                    <p className="text-muted-foreground text-sm">Aucune phase définie</p>
                  ) : (
                    <div className="space-y-2">
                      {settings.phases.map((phase) => (
                        <div key={phase.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold">{phase.name}</h3>
                              <Badge variant={phase.status === "completed" ? "default" : phase.status === "in-progress" ? "secondary" : "outline"}>
                                {phase.status === "not-started" ? "Non démarrée" : phase.status === "in-progress" ? "En cours" : "Terminée"}
                              </Badge>
                              {settings.currentPhaseId === phase.id && (
                                <Badge variant="default">Phase courante</Badge>
                              )}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground mb-2">
                            Type: {phase.type === "swiss" ? "Rondes suisses" : "Élimination directe"} • 
                            Format: {phase.matchType}
                            {phase.rounds && ` • ${phase.rounds} rondes`}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSetCurrentPhase(phase.id)}
                              disabled={settings.currentPhaseId === phase.id}
                            >
                              Définir comme courante
                            </Button>
                            {phase.status === "not-started" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdatePhaseStatus(phase.id, "in-progress")}
                              >
                                Démarrer
                              </Button>
                            )}
                            {phase.status === "in-progress" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleUpdatePhaseStatus(phase.id, "completed")}
                              >
                                Terminer
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Paramètres du portail</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Auto-rapport des résultats</span>
                    <Badge variant={settings.allowSelfReporting ? "default" : "secondary"}>
                      {settings.allowSelfReporting ? "Activé" : "Désactivé"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Confirmation requise</span>
                    <Badge variant={settings.requireConfirmation ? "default" : "secondary"}>
                      {settings.requireConfirmation ? "Oui" : "Non"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      )}

      {activeTab === "participants" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gestion des participants</CardTitle>
              <CardDescription>
                Ajoutez des participants par user tag, email ou comme invités
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddParticipantForm
                eventId={event.id}
                participants={participants}
                onParticipantAdded={() => {
                  setParticipantsLoaded(false);
                  loadParticipants();
                }}
                onParticipantRemoved={() => {
                  setParticipantsLoaded(false);
                  loadParticipants();
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "matches" && settings && (
        <div className="space-y-6">
          {/* Navigation par ronde/phase */}
          {matches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Navigation par ronde</CardTitle>
                <CardDescription>
                  Sélectionnez une phase et une ronde
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {settings.phases
                    .sort((a, b) => a.order - b.order)
                    .map((phase) => {
                      const phaseMatches = matches.filter(m => m.phaseId === phase.id);
                      const rounds = Array.from(new Set(phaseMatches.map(m => m.round || 1))).sort((a, b) => a - b);
                      
                      if (rounds.length === 0) return null;

                      return (
                        <div key={phase.id} className="flex items-center gap-1">
                          <span className="text-sm font-medium text-muted-foreground px-2">
                            {phase.name}:
                          </span>
                          {rounds.map((round) => {
                            const isActive = selectedPhaseId === phase.id && selectedRound === round.toString();
                            return (
                              <Link 
                                key={`${phase.id}-${round}`}
                                href={`/events/${event.id}/portal/organizer/matches/${phase.id}/${round}`}
                              >
                                <Button
                                  variant={isActive ? "default" : "outline"}
                                  size="sm"
                                  className="h-8"
                                >
                                  R{round}
                                </Button>
                              </Link>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sélection de phase et génération */}
          {settings.currentPhaseId && (
            <Card>
              <CardHeader>
                <CardTitle>Génération automatique</CardTitle>
                <CardDescription>
                  Générer automatiquement les matchs pour la phase courante
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Button 
                    onClick={() => handleGenerateMatches(settings.currentPhaseId!)}
                    disabled={isPending}
                  >
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Générer les matchs
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Phase: {settings.phases.find(p => p.id === settings.currentPhaseId)?.name}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Gestion des matchs</CardTitle>
                  <CardDescription>
                    Créez et gérez les matchs de votre tournoi
                  </CardDescription>
                </div>
                <Button onClick={() => setShowMatchForm(!showMatchForm)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Créer un match manuellement
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Modal d'édition de match */}
              {editingMatch && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingMatch(null)}>
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-lg font-semibold mb-4">Modifier le résultat</h3>
                    <div className="space-y-4">
                      <div className="font-medium text-center mb-2">
                        {getParticipantName(editingMatch.player1Id)} vs {getParticipantName(editingMatch.player2Id)}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">
                            Score {getParticipantName(editingMatch.player1Id)}
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={editingMatch.player1Score}
                            onChange={(e) => setEditingMatch({
                              ...editingMatch,
                              player1Score: parseInt(e.target.value) || 0
                            })}
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium">
                            Score {getParticipantName(editingMatch.player2Id)}
                          </label>
                          <Input
                            type="number"
                            min="0"
                            value={editingMatch.player2Score}
                            onChange={(e) => setEditingMatch({
                              ...editingMatch,
                              player2Score: parseInt(e.target.value) || 0
                            })}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-4">
                        <Button 
                          variant="outline" 
                          onClick={() => setEditingMatch(null)}
                          className="flex-1"
                        >
                          Annuler
                        </Button>
                        <Button 
                          onClick={handleSaveMatchEdit} 
                          disabled={isPending}
                          className="flex-1"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          Sauvegarder
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {showMatchForm && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium">Phase</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={matchForm.phaseId}
                      onChange={(e) => setMatchForm({ ...matchForm, phaseId: e.target.value })}
                    >
                      <option value="">Sélectionner une phase</option>
                      {settings.phases.map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Joueur 1</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={matchForm.player1Id}
                      onChange={(e) => setMatchForm({ ...matchForm, player1Id: e.target.value })}
                    >
                      <option value="">Sélectionner un joueur</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {getParticipantName(p.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Joueur 2</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={matchForm.player2Id}
                      onChange={(e) => setMatchForm({ ...matchForm, player2Id: e.target.value })}
                    >
                      <option value="">Sélectionner un joueur</option>
                      {participants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {getParticipantName(p.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Score Joueur 1</label>
                      <Input
                        type="number"
                        min="0"
                        value={matchForm.player1Score}
                        onChange={(e) => setMatchForm({ ...matchForm, player1Score: parseInt(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Score Joueur 2</label>
                      <Input
                        type="number"
                        min="0"
                        value={matchForm.player2Score}
                        onChange={(e) => setMatchForm({ ...matchForm, player2Score: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Ronde</label>
                    <Input
                      type="number"
                      min="1"
                      value={matchForm.round}
                      onChange={(e) => setMatchForm({ ...matchForm, round: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCreateMatch} 
                      disabled={isPending || !matchForm.phaseId || !matchForm.player1Id || !matchForm.player2Id}
                    >
                      Créer le match
                    </Button>
                    <Button variant="outline" onClick={() => setShowMatchForm(false)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {matches.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucun match créé</p>
              ) : (
                <div className="space-y-4">
                  {/* Filtrer les matchs selon la sélection */}
                  {(() => {
                    // Si une phase et une ronde sont sélectionnées, filtrer
                    if (selectedPhaseId && selectedRound) {
                      const roundNum = parseInt(selectedRound);
                      const filteredMatches = matches.filter(
                        m => m.phaseId === selectedPhaseId && (m.round || 1) === roundNum
                      );
                      
                      if (filteredMatches.length === 0) {
                        return <p className="text-muted-foreground text-sm">Aucun match pour cette ronde</p>;
                      }

                      const phase = settings?.phases.find(p => p.id === selectedPhaseId);
                      
                      // Pour les phases bracket, afficher en mode bracket (toutes les rondes)
                      if (phase?.type === "bracket") {
                        const allPhaseMatches = matches.filter(m => m.phaseId === selectedPhaseId);
                        return (
                          <div className="space-y-2">
                            <h3 className="font-semibold mb-4">
                              {phase.name} - Vue Bracket
                            </h3>
                            <BracketView
                              matches={allPhaseMatches}
                              getParticipantName={getParticipantName}
                              onEditMatch={handleEditMatch}
                              onDeleteMatch={handleDeleteMatch}
                            />
                          </div>
                        );
                      }
                      
                      // Pour les phases suisses, afficher la liste de la ronde
                      return (
                        <div className="space-y-2">
                          <h3 className="font-semibold">
                            {phase?.name} - Ronde {roundNum}
                          </h3>
                          {filteredMatches.map((match) => (
                            <div key={match.matchId} className="border rounded-lg p-4">
                              {editingMatch?.matchId === match.matchId ? (
                                // Mode édition
                                <div className="space-y-4">
                                  <div className="font-medium">
                                    {getParticipantName(match.player1Id)} vs {getParticipantName(match.player2Id)}
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <label className="text-sm font-medium">
                                        Score {getParticipantName(match.player1Id)}
                                      </label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editingMatch.player1Score}
                                        onChange={(e) => setEditingMatch({
                                          ...editingMatch,
                                          player1Score: parseInt(e.target.value) || 0
                                        })}
                                      />
                                    </div>
                                    <div>
                                      <label className="text-sm font-medium">
                                        Score {getParticipantName(match.player2Id)}
                                      </label>
                                      <Input
                                        type="number"
                                        min="0"
                                        value={editingMatch.player2Score}
                                        onChange={(e) => setEditingMatch({
                                          ...editingMatch,
                                          player2Score: parseInt(e.target.value) || 0
                                        })}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={handleSaveMatchEdit} disabled={isPending}>
                                      <Check className="h-4 w-4 mr-2" />
                                      Sauvegarder
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => setEditingMatch(null)}>
                                      Annuler
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                // Mode affichage
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium mb-1">
                                      {getParticipantName(match.player1Id)} vs {getParticipantName(match.player2Id)}
                                    </div>
                                    <div className="text-2xl font-bold mb-2">
                                      {match.player1Score} - {match.player2Score}
                                    </div>
                                    <div className="flex gap-2">
                                      <Badge variant={
                                        match.status === "completed" ? "default" : 
                                        match.status === "in-progress" ? "secondary" : "outline"
                                      }>
                                        {match.status === "completed" ? "Terminé" : 
                                         match.status === "in-progress" ? "En cours" : "En attente"}
                                      </Badge>
                                      {match.winnerId && (
                                        <Badge variant="outline">
                                          Vainqueur: {getParticipantName(match.winnerId)}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setEditingMatch(match)}
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => handleDeleteMatch(match.matchId)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    }

                    // Sinon, afficher tous les matchs groupés par ronde
                    return Array.from(new Set(matches.map(m => m.round || 1))).sort((a, b) => a - b).map(round => (
                      <div key={round} className="space-y-2">
                        <h3 className="font-semibold text-sm">Ronde {round}</h3>
                        {matches.filter(m => (m.round || 1) === round).map((match) => (
                        <div key={match.matchId} className="border rounded-lg p-4">
                          {editingMatch?.matchId === match.matchId ? (
                            // Mode édition
                            <div className="space-y-4">
                              <div className="font-medium">
                                {getParticipantName(match.player1Id)} vs {getParticipantName(match.player2Id)}
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">
                                    Score {getParticipantName(match.player1Id)}
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingMatch.player1Score}
                                    onChange={(e) => setEditingMatch({
                                      ...editingMatch,
                                      player1Score: parseInt(e.target.value) || 0
                                    })}
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">
                                    Score {getParticipantName(match.player2Id)}
                                  </label>
                                  <Input
                                    type="number"
                                    min="0"
                                    value={editingMatch.player2Score}
                                    onChange={(e) => setEditingMatch({
                                      ...editingMatch,
                                      player2Score: parseInt(e.target.value) || 0
                                    })}
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={handleSaveMatchEdit} disabled={isPending}>
                                  <Check className="h-4 w-4 mr-2" />
                                  Sauvegarder
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingMatch(null)}>
                                  Annuler
                                </Button>
                              </div>
                            </div>
                          ) : (
                            // Mode affichage
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">
                                  {getParticipantName(match.player1Id)} vs {getParticipantName(match.player2Id)}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  Score: {match.player1Score} - {match.player2Score}
                                  {match.bracketPosition && ` • ${match.bracketPosition}`}
                                </div>
                                <Badge variant={
                                  match.status === "completed" ? "default" : 
                                  match.status === "in-progress" ? "secondary" : 
                                  match.status === "disputed" ? "destructive" : "outline"
                                }>
                                  {match.status === "pending" ? "En attente" : 
                                   match.status === "in-progress" ? "En cours" : 
                                   match.status === "completed" ? "Terminé" : "Contesté"}
                                </Badge>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditMatch(match)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDeleteMatch(match.matchId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ));
                  })()}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === "announcements" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Annonces</CardTitle>
                  <CardDescription>
                    Communiquez avec les participants
                  </CardDescription>
                </div>
                <Button onClick={() => setShowAnnouncementForm(!showAnnouncementForm)} size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nouvelle annonce
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {showAnnouncementForm && (
                <div className="border rounded-lg p-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <textarea
                      className="w-full border rounded-md p-2 min-h-[100px]"
                      value={announcementForm.message}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                      placeholder="Votre annonce..."
                      maxLength={1000}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Priorité</label>
                    <select
                      className="w-full border rounded-md p-2"
                      value={announcementForm.priority}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, priority: e.target.value as any })}
                    >
                      <option value="normal">Normale</option>
                      <option value="important">Importante</option>
                      <option value="urgent">Urgente</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleCreateAnnouncement} 
                      disabled={isPending || !announcementForm.message}
                    >
                      Publier
                    </Button>
                    <Button variant="outline" onClick={() => setShowAnnouncementForm(false)}>
                      Annuler
                    </Button>
                  </div>
                </div>
              )}

              {announcements.length === 0 ? (
                <p className="text-muted-foreground text-sm">Aucune annonce publiée</p>
              ) : (
                <div className="space-y-2">
                  {announcements.map((announcement) => (
                    <div key={announcement.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant={
                              announcement.priority === "urgent" ? "destructive" : 
                              announcement.priority === "important" ? "secondary" : "outline"
                            }>
                              {announcement.priority === "urgent" ? "Urgent" : 
                               announcement.priority === "important" ? "Important" : "Normal"}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(announcement.createdAt).toLocaleString("fr-FR")}
                            </span>
                          </div>
                          <p className="text-sm">{announcement.message}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
