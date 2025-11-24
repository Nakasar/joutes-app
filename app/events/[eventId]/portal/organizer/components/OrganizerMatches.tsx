"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings, MatchResult } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Plus, PlayCircle, Edit, Trash2, Check, MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  createMatchResult,
  updateMatchResult,
  deleteMatchResult,
  deleteRoundMatches,
  generateMatchesForPhase,
} from "../../actions";
import BracketView from "../../BracketView";

type OrganizerMatchesProps = {
  event: Event;
  settings: EventPortalSettings;
  matches: MatchResult[];
  participants: any[];
  selectedPhaseId?: string;
  selectedRound?: string;
  userId: string;
};

export default function OrganizerMatches({
  event,
  settings,
  matches,
  participants,
  selectedPhaseId,
  selectedRound,
  userId,
}: OrganizerMatchesProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showMatchForm, setShowMatchForm] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchResult | null>(null);
  const [showDeleteRoundDialog, setShowDeleteRoundDialog] = useState(false);

  const [matchForm, setMatchForm] = useState({
    phaseId: "",
    player1Id: "",
    player2Id: "",
    player1Score: 0,
    player2Score: 0,
    round: 1,
  });

  const getParticipantName = (participantId: string | null) => {
    if (!participantId) return "BYE";
    const participant = participants.find(p => p.id === participantId);
    if (!participant) return "Joueur inconnu";
    if (participant.type === "guest") return participant.username;
    return `${participant.username}#${participant.discriminator}`;
  };

  const canGenerateMatches = () => {
    if (!settings?.currentPhaseId) return false;

    const currentPhase = settings.phases.find(p => p.id === settings.currentPhaseId);
    if (!currentPhase) return false;

    const phaseMatches = matches.filter(m => m.phaseId === settings.currentPhaseId);
    
    if (phaseMatches.length === 0) return true;

    const maxRound = Math.max(...phaseMatches.map(m => m.round || 1));
    const lastRoundMatches = phaseMatches.filter(m => (m.round || 1) === maxRound);
    const allMatchesCompleted = lastRoundMatches.every(m => 
      m.player1Score !== undefined && 
      m.player2Score !== undefined && 
      m.status === 'completed'
    );

    if (!allMatchesCompleted) return false;

    if (currentPhase.type === "swiss" && currentPhase.rounds) {
      return maxRound < currentPhase.rounds;
    }

    return true;
  };

  const canDeleteRoundMatches = () => {
    if (!selectedPhaseId || !selectedRound || !settings) return false;

    const selectedRoundNum = parseInt(selectedRound);
    const selectedPhaseIndex = settings.phases.findIndex(p => p.id === selectedPhaseId);

    for (const [index, phase] of settings.phases.entries()) {
      const phaseMatches = matches.filter(m => m.phaseId === phase.id);
      
      if (phase.id === selectedPhaseId) {
        const hasLaterRounds = phaseMatches.some(m => (m.round || 1) > selectedRoundNum);
        if (hasLaterRounds) return false;
      } else if (index > selectedPhaseIndex) {
        if (phaseMatches.length > 0) return false;
      }
    }

    return true;
  };

  const handleGenerateMatches = (phaseId: string) => {
    startTransition(async () => {
      await generateMatchesForPhase(event.id, phaseId);
      router.refresh();
    });
  };

  const handleCreateMatch = () => {
    startTransition(async () => {
      const matchId = `match-${Date.now()}`;
      const winnerId = matchForm.player1Score > matchForm.player2Score 
        ? matchForm.player1Id 
        : matchForm.player2Score > matchForm.player1Score
          ? matchForm.player2Id
          : undefined;

      await createMatchResult(event.id, {
        ...matchForm,
        matchId,
        winnerId,
      });

      setShowMatchForm(false);
      setMatchForm({
        phaseId: "",
        player1Id: "",
        player2Id: "",
        player1Score: 0,
        player2Score: 0,
        round: 1,
      });
      router.refresh();
    });
  };

  const handleSaveMatchEdit = () => {
    if (!editingMatch) return;

    startTransition(async () => {
      const winnerId = editingMatch.player1Score > editingMatch.player2Score
        ? editingMatch.player1Id
        : editingMatch.player2Score > editingMatch.player1Score
          ? editingMatch.player2Id
          : undefined;

      await updateMatchResult(event.id, editingMatch.matchId, {
        matchId: editingMatch.matchId,
        player1Score: editingMatch.player1Score,
        player2Score: editingMatch.player2Score,
        winnerId,
        status: "completed",
      });

      setEditingMatch(null);
      router.refresh();
    });
  };

  const handleDeleteMatch = (matchId: string) => {
    startTransition(async () => {
      await deleteMatchResult(event.id, matchId);
      router.refresh();
    });
  };

  const handleDeleteRoundMatches = () => {
    if (!selectedPhaseId || !selectedRound) return;

    startTransition(async () => {
      await deleteRoundMatches(event.id, selectedPhaseId, parseInt(selectedRound));
      setShowDeleteRoundDialog(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      {settings && matches.length > 0 && (
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

      {settings?.currentPhaseId && canGenerateMatches() && (
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
                onClick={() => settings?.currentPhaseId && handleGenerateMatches(settings.currentPhaseId)}
                disabled={isPending}
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Générer les matchs
              </Button>
              <p className="text-sm text-muted-foreground">
                Phase: {settings?.phases.find(p => p.id === settings?.currentPhaseId)?.name}
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
            <div className="flex gap-2">
              {selectedPhaseId && selectedRound && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreVertical className="h-4 w-4 mr-2" />
                      Actions
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem 
                      onClick={() => canDeleteRoundMatches() && setShowDeleteRoundDialog(true)}
                      className="text-destructive"
                      disabled={!canDeleteRoundMatches()}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Supprimer tous les matchs de la ronde
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button onClick={() => setShowMatchForm(!showMatchForm)} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Créer un match manuellement
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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
                  {settings?.phases.map((phase) => (
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
              {(() => {
                if (!selectedPhaseId || !selectedRound) {
                  return (
                    <div className="text-center py-8">
                      <p className="text-muted-foreground">
                        Sélectionnez une phase et une ronde pour afficher les matchs
                      </p>
                    </div>
                  );
                }

                const roundNum = parseInt(selectedRound);
                const filteredMatches = matches.filter(
                  m => m.phaseId === selectedPhaseId && (m.round || 1) === roundNum
                );
                
                if (filteredMatches.length === 0) {
                  return <p className="text-muted-foreground text-sm">Aucun match pour cette ronde</p>;
                }

                const phase = settings?.phases.find(p => p.id === selectedPhaseId);
                
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
                        onEditMatch={(match) => setEditingMatch(match)}
                        onDeleteMatch={handleDeleteMatch}
                      />
                    </div>
                  );
                }
                
                return (
                  <div className="space-y-2">
                    <h3 className="font-semibold">
                      {phase?.name} - Ronde {roundNum}
                    </h3>
                    {filteredMatches.map((match) => (
                      <div key={match.matchId} className="border rounded-lg p-4">
                        {editingMatch?.matchId === match.matchId ? (
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
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de modification de match */}
      <Dialog open={!!editingMatch} onOpenChange={(open) => !open && setEditingMatch(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le match</DialogTitle>
            <DialogDescription>
              {editingMatch && (
                <>
                  {getParticipantName(editingMatch.player1Id)} vs {getParticipantName(editingMatch.player2Id)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          {editingMatch && (
            <div className="space-y-4">
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
                      player1Score: parseInt(e.target.value) || 0,
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
                      player2Score: parseInt(e.target.value) || 0,
                    })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingMatch(null)}
            >
              Annuler
            </Button>
            <Button
              onClick={handleSaveMatchEdit}
              disabled={isPending}
            >
              <Check className="h-4 w-4 mr-2" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteRoundDialog} onOpenChange={setShowDeleteRoundDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer tous les matchs de la ronde</DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir supprimer tous les matchs de la ronde {selectedRound} ?
              Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteRoundDialog(false)}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteRoundMatches}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
