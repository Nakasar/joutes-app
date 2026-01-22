"use client";

import { useState, useTransition } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PlayCircle, Plus, Edit, Trash2, Save, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  createOrUpdatePortalSettings,
  addPhase,
  updatePhase,
  deletePhase,
  updatePhaseStatus,
  setCurrentPhase,
} from "../../actions";
import { useRouter } from "next/navigation";

type OrganizerSettingsProps = {
  event: Event;
  settings?: EventPortalSettings | null;
};

export default function OrganizerSettings({ event, settings }: OrganizerSettingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [phaseToDelete, setPhaseToDelete] = useState<string | null>(null);
  const [phaseForm, setPhaseForm] = useState({
    name: "",
    type: "swiss" as "swiss" | "bracket",
    matchType: "BO1" as "BO1" | "BO2" | "BO3" | "BO5",
    rounds: 3,
    topCut: 8,
  });

  const isEventCompleted = event.runningState === 'completed';

  const handleInitializeSettings = () => {
    startTransition(async () => {
      await createOrUpdatePortalSettings({
        eventId: event.id,
        allowSelfReporting: false,
        requireConfirmation: true,
        phases: []
      });
      router.refresh();
    });
  };

  const handleAddPhase = () => {
    startTransition(async () => {
      await addPhase(event.id, {
        name: phaseForm.name,
        type: phaseForm.type,
        matchType: phaseForm.matchType,
        rounds: phaseForm.type === "swiss" ? phaseForm.rounds : undefined,
        topCut: phaseForm.type === "bracket" ? phaseForm.topCut : undefined,
        order: settings ? settings.phases.length : 0,
      });
      setPhaseForm({
        name: "",
        type: "swiss",
        matchType: "BO1",
        rounds: 3,
        topCut: 8,
      });
      setShowPhaseForm(false);
      router.refresh();
    });
  };

  const handleUpdatePhaseStatus = (phaseId: string, status: "not-started" | "in-progress" | "completed") => {
    startTransition(async () => {
      await updatePhaseStatus(event.id, phaseId, status);
      router.refresh();
    });
  };

  const handleSetCurrentPhase = (phaseId: string) => {
    startTransition(async () => {
      await setCurrentPhase(event.id, phaseId);
      router.refresh();
    });
  };

  const handleEditPhase = (phase: any) => {
    setEditingPhaseId(phase.id);
    setPhaseForm({
      name: phase.name,
      type: phase.type,
      matchType: phase.matchType,
      rounds: phase.rounds || 3,
      topCut: phase.topCut || 8,
    });
  };

  const handleUpdatePhase = () => {
    if (!editingPhaseId) return;

    startTransition(async () => {
      await updatePhase(event.id, editingPhaseId, {
        name: phaseForm.name,
        type: phaseForm.type,
        matchType: phaseForm.matchType,
        rounds: phaseForm.type === "swiss" ? phaseForm.rounds : undefined,
        topCut: phaseForm.type === "bracket" ? phaseForm.topCut : undefined,
      });
      setEditingPhaseId(null);
      setPhaseForm({
        name: "",
        type: "swiss",
        matchType: "BO1",
        rounds: 3,
        topCut: 8,
      });
      router.refresh();
    });
  };

  const handleCancelEdit = () => {
    setEditingPhaseId(null);
    setPhaseForm({
      name: "",
      type: "swiss",
      matchType: "BO1",
      rounds: 3,
      topCut: 8,
    });
  };

  const handleDeletePhase = (phaseId: string) => {
    setPhaseToDelete(phaseId);
    setDeleteDialogOpen(true);
  };

  const confirmDeletePhase = () => {
    if (!phaseToDelete) return;

    startTransition(async () => {
      await deletePhase(event.id, phaseToDelete);
      setDeleteDialogOpen(false);
      setPhaseToDelete(null);
      router.refresh();
    });
  };

  return (
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
                <Button 
                  onClick={() => setShowPhaseForm(!showPhaseForm)} 
                  size="sm"
                  disabled={isEventCompleted}
                >
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
                      {editingPhaseId === phase.id ? (
                        // Mode édition
                        <div className="space-y-4">
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
                              disabled={phase.status !== 'not-started'}
                            >
                              <option value="swiss">Rondes suisses</option>
                              <option value="bracket">Élimination directe</option>
                            </select>
                            {phase.status !== 'not-started' && (
                              <p className="text-xs text-amber-600 mt-1">
                                Le type ne peut pas être modifié une fois la phase démarrée
                              </p>
                            )}
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
                            <Button onClick={handleUpdatePhase} disabled={isPending || !phaseForm.name} size="sm">
                              <Save className="h-4 w-4 mr-2" />
                              Enregistrer
                            </Button>
                            <Button variant="outline" onClick={handleCancelEdit} size="sm">
                              <X className="h-4 w-4 mr-2" />
                              Annuler
                            </Button>
                          </div>
                        </div>
                      ) : (
                        // Mode affichage
                        <>
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
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleEditPhase(phase)}
                                disabled={isPending || isEventCompleted}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeletePhase(phase.id)}
                                disabled={isPending || phase.status !== 'not-started' || isEventCompleted}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
                        </>
                      )}
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

      {/* Dialog de confirmation de suppression */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer cette phase ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeletePhase} disabled={isPending}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
