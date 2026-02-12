"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import { Event } from "@/lib/types/Event";
import { EventPortalSettings } from "@/lib/schemas/event-portal.schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { DateTime } from "luxon";
import { updateEventDetailsAction } from "@/app/events/actions";

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

  const [portalSettingsForm, setPortalSettingsForm] = useState({
    allowSelfReporting: settings?.allowSelfReporting ?? false,
    requireConfirmation: settings?.requireConfirmation ?? true,
  });
  const [portalSettingsError, setPortalSettingsError] = useState<string | null>(null);
  const [portalSettingsSuccess, setPortalSettingsSuccess] = useState<string | null>(null);

  const [eventForm, setEventForm] = useState({
    name: event.name,
    gameName: event.gameName,
    startDateTime: "",
    endDateTime: "",
    url: event.url ?? "",
    price: event.price?.toString() ?? "",
    maxParticipants: event.maxParticipants?.toString() ?? "",
  });
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [eventFormSuccess, setEventFormSuccess] = useState<string | null>(null);

  const isEventCompleted = event.runningState === 'completed';

  const formatDateTimeInput = (value: string) => {
    const parsed = DateTime.fromISO(value);
    return parsed.isValid ? parsed.toFormat("yyyy-MM-dd'T'HH:mm") : "";
  };

  useEffect(() => {
    setPortalSettingsForm({
      allowSelfReporting: settings?.allowSelfReporting ?? false,
      requireConfirmation: settings?.requireConfirmation ?? true,
    });
  }, [settings]);

  useEffect(() => {
    setEventForm({
      name: event.name,
      gameName: event.gameName,
      startDateTime: formatDateTimeInput(event.startDateTime),
      endDateTime: formatDateTimeInput(event.endDateTime),
      url: event.url ?? "",
      price: event.price?.toString() ?? "",
      maxParticipants: event.maxParticipants?.toString() ?? "",
    });
  }, [event]);

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

  const handleUpdatePortalSettings = () => {
    if (!settings) return;

    startTransition(async () => {
      setPortalSettingsError(null);
      setPortalSettingsSuccess(null);

      const result = await createOrUpdatePortalSettings({
        eventId: event.id,
        phases: settings.phases,
        currentPhaseId: settings.currentPhaseId,
        allowSelfReporting: portalSettingsForm.allowSelfReporting,
        requireConfirmation: portalSettingsForm.requireConfirmation,
      });

      if (result.success) {
        setPortalSettingsSuccess("Paramètres du portail mis à jour");
        router.refresh();
      } else {
        setPortalSettingsError(result.error || "Erreur lors de la mise à jour des paramètres");
      }
    });
  };

  const handleUpdateEventDetails = (eventToUpdate: FormEvent<HTMLFormElement>) => {
    eventToUpdate.preventDefault();

    startTransition(async () => {
      setEventFormError(null);
      setEventFormSuccess(null);

      const result = await updateEventDetailsAction({
        eventId: event.id,
        name: eventForm.name,
        gameName: eventForm.gameName,
        startDateTime: eventForm.startDateTime,
        endDateTime: eventForm.endDateTime,
        url: eventForm.url.length > 0 ? eventForm.url : undefined,
        price: eventForm.price.length > 0 ? parseFloat(eventForm.price) : undefined,
        maxParticipants: eventForm.maxParticipants.length > 0 ? parseInt(eventForm.maxParticipants, 10) : undefined,
      });

      if (result.success) {
        setEventFormSuccess(result.unchanged ? "Aucune modification à enregistrer" : "Événement mis à jour");
        router.refresh();
      } else {
        setEventFormError(result.error || "Erreur lors de la mise à jour de l&apos;événement");
      }
    });
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
      <Card>
        <CardHeader>
          <CardTitle>Détails de l&apos;événement</CardTitle>
          <CardDescription>
            Mettez à jour les informations principales de votre événement
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateEventDetails} className="space-y-4">
            {eventFormError && (
              <Alert variant="destructive">
                <AlertDescription>{eventFormError}</AlertDescription>
              </Alert>
            )}
            {eventFormSuccess && (
              <Alert>
                <AlertDescription>{eventFormSuccess}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label htmlFor="event-name" className="text-sm font-medium">
                Nom de l&apos;événement
              </label>
              <Input
                id="event-name"
                required
                maxLength={500}
                value={eventForm.name}
                onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="event-game" className="text-sm font-medium">
                Jeu
              </label>
              <Input
                id="event-game"
                required
                value={eventForm.gameName}
                onChange={(e) => setEventForm({ ...eventForm, gameName: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="event-start" className="text-sm font-medium">
                  Date et heure de début
                </label>
                <Input
                  id="event-start"
                  type="datetime-local"
                  required
                  value={eventForm.startDateTime}
                  onChange={(e) => setEventForm({ ...eventForm, startDateTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="event-end" className="text-sm font-medium">
                  Date et heure de fin
                </label>
                <Input
                  id="event-end"
                  type="datetime-local"
                  required
                  value={eventForm.endDateTime}
                  onChange={(e) => setEventForm({ ...eventForm, endDateTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="event-url" className="text-sm font-medium">
                URL (optionnel)
              </label>
              <Input
                id="event-url"
                type="url"
                value={eventForm.url}
                onChange={(e) => setEventForm({ ...eventForm, url: e.target.value })}
                placeholder="https://example.com/event"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="event-price" className="text-sm font-medium">
                  Prix (€, optionnel)
                </label>
                <Input
                  id="event-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={eventForm.price}
                  onChange={(e) => setEventForm({ ...eventForm, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="event-max" className="text-sm font-medium">
                  Nombre max de participants (optionnel)
                </label>
                <Input
                  id="event-max"
                  type="number"
                  min="1"
                  value={eventForm.maxParticipants}
                  onChange={(e) => setEventForm({ ...eventForm, maxParticipants: e.target.value })}
                  placeholder="Illimité"
                />
                <p className="text-xs text-muted-foreground">
                  Valeur actuelle: {event.registeredParticipantsCount ?? 0} inscrit(s)
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={isPending}>
                Mettre à jour l&apos;événement
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

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
            <CardContent className="space-y-4">
              {portalSettingsError && (
                <Alert variant="destructive">
                  <AlertDescription>{portalSettingsError}</AlertDescription>
                </Alert>
              )}
              {portalSettingsSuccess && (
                <Alert>
                  <AlertDescription>{portalSettingsSuccess}</AlertDescription>
                </Alert>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="allow-self-reporting" className="text-sm font-medium">
                    Auto-rapport des résultats
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Autoriser les joueurs à saisir leurs scores
                  </p>
                </div>
                <Switch
                  id="allow-self-reporting"
                  checked={portalSettingsForm.allowSelfReporting}
                  onCheckedChange={(checked) =>
                    setPortalSettingsForm({
                      ...portalSettingsForm,
                      allowSelfReporting: checked,
                    })
                  }
                  disabled={isPending || isEventCompleted}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <label htmlFor="require-confirmation" className="text-sm font-medium">
                    Confirmation requise
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Exiger la validation du résultat par l&apos;adversaire
                  </p>
                </div>
                <Switch
                  id="require-confirmation"
                  checked={portalSettingsForm.requireConfirmation}
                  onCheckedChange={(checked) =>
                    setPortalSettingsForm({
                      ...portalSettingsForm,
                      requireConfirmation: checked,
                    })
                  }
                  disabled={isPending || isEventCompleted}
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleUpdatePortalSettings}
                  disabled={isPending || isEventCompleted}
                >
                  Enregistrer les paramètres
                </Button>
              </div>
              {isEventCompleted && (
                <p className="text-xs text-muted-foreground">
                  Les paramètres du portail ne peuvent plus être modifiés une fois l&apos;événement terminé.
                </p>
              )}
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
