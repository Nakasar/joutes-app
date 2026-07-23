"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  Tournament,
  TournamentPhase,
  TournamentPlayer,
  TournamentPhaseType,
  TournamentResultMode,
  TournamentRound,
  TournamentScoringMethod,
  TournamentEliminationSeeding,
} from "@/lib/types/Tournament";
import { PlayerSyncQRButton } from "./PlayerSyncQRButton";
import { RoundHistoryBrowser } from "../RoundHistoryBrowser";

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

const PHASE_TYPE_LABELS: Record<TournamentPhaseType, string> = {
  freeform: "Format libre",
  swiss: "Rondes suisses",
  elimination: "Élimination (ré-appariement)",
  bracket: "Arbre d'élimination",
};

const PHASE_STATUS_LABELS: Record<string, string> = {
  "not-started": "Non démarrée",
  "in-progress": "En cours",
  completed: "Terminée",
};

type Props = {
  tournament: Tournament;
  initialPlayers: TournamentPlayer[];
  initialPhases: TournamentPhase[];
  initialRounds: TournamentRound[];
};

export function OrganizerClient({ tournament, initialPlayers, initialPhases, initialRounds }: Props) {
  const [players, setPlayers] = useState<TournamentPlayer[]>(initialPlayers);
  const [phases, setPhases] = useState<TournamentPhase[]>(initialPhases);
  const [rounds, setRounds] = useState<TournamentRound[]>(initialRounds);
  const [status, setStatus] = useState<Tournament["status"]>(tournament.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Réglages du tournoi (onglet Configuration). `savedSettings` sert de
  // référence pour l'état « modifié » : il est mis à jour après un
  // enregistrement réussi (les props tournament.settings, elles, ne changent
  // pas côté client).
  const [allowSelfReporting, setAllowSelfReporting] = useState(tournament.settings.allowSelfReporting);
  const [requireConfirmation, setRequireConfirmation] = useState(tournament.settings.requireConfirmation);
  const [savedSettings, setSavedSettings] = useState({
    allowSelfReporting: tournament.settings.allowSelfReporting,
    requireConfirmation: tournament.settings.requireConfirmation,
  });

  // Ajout de joueur : email, username#discriminator, ou simple nom (invité).
  const [newPlayerIdentifier, setNewPlayerIdentifier] = useState("");

  // Ajout de phase
  const [phaseName, setPhaseName] = useState("");
  const [phaseType, setPhaseType] = useState<TournamentPhaseType>("swiss");
  const [phaseBestOf, setPhaseBestOf] = useState("1");
  const [phaseResultMode, setPhaseResultMode] = useState<TournamentResultMode>("selection");
  const [phaseScoringMethod, setPhaseScoringMethod] = useState<TournamentScoringMethod>("fixed");
  const [phaseWin, setPhaseWin] = useState("3");
  const [phaseLoss, setPhaseLoss] = useState("0");
  const [phaseDraw, setPhaseDraw] = useState("1");
  const [phaseRankOffsets, setPhaseRankOffsets] = useState("3,1,-1,-3,-4,-5,-7");
  const [phaseSeeding, setPhaseSeeding] = useState<TournamentEliminationSeeding>("standings");
  const [phaseRounds, setPhaseRounds] = useState("");
  const [phaseTopCut, setPhaseTopCut] = useState("");
  const [phaseMinPlayers, setPhaseMinPlayers] = useState("2");
  const [phaseMaxPlayers, setPhaseMaxPlayers] = useState("2");

  const tournamentId = tournament.id;

  const api = useCallback(
    async (path: string, init?: RequestInit) => {
      const res = await fetch(path, {
        ...init,
        headers: {
          ...(init?.body ? { "Content-Type": "application/json" } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Une erreur est survenue");
      }
      return res.status === 204 ? null : res.json();
    },
    []
  );

  const refreshPlayers = useCallback(async () => {
    setPlayers(await api(`/api/tournaments/${tournamentId}/players`));
  }, [api, tournamentId]);

  const refreshPhases = useCallback(async () => {
    setPhases(await api(`/api/tournaments/${tournamentId}/phases`));
  }, [api, tournamentId]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Une erreur est survenue");
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const addPlayer = () =>
    run(async () => {
      if (!newPlayerIdentifier.trim()) return;
      await api(`/api/tournaments/${tournamentId}/players`, {
        method: "POST",
        body: JSON.stringify({ identifier: newPlayerIdentifier.trim() }),
      });
      setNewPlayerIdentifier("");
      await refreshPlayers();
    });

  const removePlayer = (player: TournamentPlayer) =>
    run(async () => {
      // Un joueur avec des matchs ne peut pas être supprimé : on le retire du
      // format (drop) plutôt que de tenter une suppression qui échouerait.
      const res = await fetch(`/api/tournaments/${tournamentId}/players/${player.id}`, {
        method: "DELETE",
      });
      if (res.status === 409) {
        await api(`/api/tournaments/${tournamentId}/players/${player.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "dropped" }),
        });
      } else if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Erreur lors de la suppression du joueur");
      }
      await refreshPlayers();
    });

  const reactivatePlayer = (player: TournamentPlayer) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/players/${player.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "active" }),
      });
      await refreshPlayers();
    });

  const addPhase = () =>
    run(async () => {
      if (!phaseName.trim()) return;
      const body: Record<string, unknown> = {
        name: phaseName.trim(),
        type: phaseType,
        resultMode: phaseResultMode,
        scoringMethod: phaseScoringMethod,
      };
      const parsedBestOf = Number.parseInt(phaseBestOf, 10);
      body.bestOf = Number.isFinite(parsedBestOf) && parsedBestOf >= 1 ? parsedBestOf : 1;

      if (phaseScoringMethod === "fixed") {
        body.fixedScoring = {
          win: Number.parseInt(phaseWin, 10) || 0,
          loss: Number.parseInt(phaseLoss, 10) || 0,
          draw: Number.parseInt(phaseDraw, 10) || 0,
        };
      } else {
        const offsets = phaseRankOffsets
          .split(",")
          .map((s) => Number.parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n));
        if (offsets.length > 0) body.rankOffsets = offsets;
      }

      if (phaseType === "elimination") {
        body.eliminationSeeding = phaseSeeding;
      }

      // N'ajouter le champ que si la saisie donne un entier positif : un NaN
      // (champ vide, "e"…) serait sérialisé en null par JSON.stringify et
      // rejeté par la validation de l'API.
      const parsedRounds = Number.parseInt(phaseRounds, 10);
      if (phaseType === "swiss" && Number.isFinite(parsedRounds) && parsedRounds > 0) {
        body.plannedRounds = parsedRounds;
      }
      // Top cut à l'entrée de la phase (hors freeform).
      const parsedTopCut = Number.parseInt(phaseTopCut, 10);
      if (phaseType !== "freeform" && Number.isFinite(parsedTopCut) && parsedTopCut > 1) {
        body.topCut = parsedTopCut;
      }
      // Bornes de joueurs par match. Le bracket est forcé à 2-2.
      if (phaseType === "bracket") {
        body.minPlayersPerMatch = 2;
        body.maxPlayersPerMatch = 2;
      } else {
        const parsedMin = Number.parseInt(phaseMinPlayers, 10);
        const parsedMax = Number.parseInt(phaseMaxPlayers, 10);
        body.minPlayersPerMatch = Number.isFinite(parsedMin) && parsedMin >= 2 ? parsedMin : 2;
        body.maxPlayersPerMatch =
          Number.isFinite(parsedMax) && parsedMax >= (body.minPlayersPerMatch as number)
            ? parsedMax
            : (body.minPlayersPerMatch as number);
      }
      await api(`/api/tournaments/${tournamentId}/phases`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPhaseName("");
      setPhaseRounds("");
      setPhaseTopCut("");
      setPhaseMinPlayers("2");
      setPhaseMaxPlayers("2");
      setPhaseBestOf("1");
      await refreshPhases();
    });

  const deletePhase = (phase: TournamentPhase) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phase.id}`, { method: "DELETE" });
      await refreshPhases();
      setRounds((prev) => prev.filter((r) => r.phaseId !== phase.id));
    });

  const generateRound = (phase: TournamentPhase) =>
    run(async () => {
      const round = await api(`/api/tournaments/${tournamentId}/phases/${phase.id}/rounds`, {
        method: "POST",
      });
      await refreshPhases();
      window.location.href = `/tournaments/${tournamentId}/organizer/rounds/${round.id}`;
    });

  // Supprime la dernière ronde d'une phase (seule la plus récente est
  // supprimable côté domaine, pour garder les pairings cohérents).
  const deleteLastRound = (round: TournamentRound) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/rounds/${round.id}`, { method: "DELETE" });
      setRounds((prev) => prev.filter((r) => r.id !== round.id));
      await refreshPhases();
    });

  const changeStatus = (next: Tournament["status"]) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setStatus(next);
    });

  const saveSettings = () =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ settings: { allowSelfReporting, requireConfirmation } }),
      });
      setSavedSettings({ allowSelfReporting, requireConfirmation });
    });

  useEffect(() => {
    // Reflète le statut si un autre onglet l'a modifié au montage.
    setStatus(tournament.status);
  }, [tournament.status]);

  const activePlayers = players.filter((p) => p.status === "active");

  // Dernière ronde par phase (celle qui est supprimable).
  const lastRoundByPhase = useMemo(() => {
    const map = new Map<string, TournamentRound>();
    for (const round of rounds) {
      const current = map.get(round.phaseId);
      if (!current || round.number > current.number) map.set(round.phaseId, round);
    }
    return map;
  }, [rounds]);

  const settingsDirty =
    allowSelfReporting !== savedSettings.allowSelfReporting ||
    requireConfirmation !== savedSettings.requireConfirmation;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground mt-1">Portail organisateur</p>
        </div>
        <Badge variant="secondary">{TOURNAMENT_STATUS_LABELS[status] ?? status}</Badge>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
          {error}
        </div>
      )}

      <Tabs defaultValue="config" className="space-y-6">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="players">Joueurs</TabsTrigger>
          <TabsTrigger value="phases">Phases</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>

        {/* Configuration */}
        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Statut du tournoi</Label>
                <Select value={status} onValueChange={(v) => changeStatus(v as Tournament["status"])}>
                  <SelectTrigger className="w-[200px]" disabled={busy}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">À venir</SelectItem>
                    <SelectItem value="in-progress">En cours</SelectItem>
                    <SelectItem value="completed">Terminé</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4 border-t pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="setting-self-reporting">Rapport de résultat par les joueurs</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Autorise les joueurs à saisir eux-mêmes le résultat de leurs matchs.
                    </p>
                  </div>
                  <Switch
                    id="setting-self-reporting"
                    checked={allowSelfReporting}
                    onCheckedChange={setAllowSelfReporting}
                    disabled={busy}
                  />
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Label htmlFor="setting-confirmation">Confirmation par l&apos;adversaire</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Un résultat rapporté par un joueur doit être confirmé par l&apos;adversaire avant
                      d&apos;être acté.
                    </p>
                  </div>
                  <Switch
                    id="setting-confirmation"
                    checked={requireConfirmation}
                    onCheckedChange={setRequireConfirmation}
                    disabled={busy}
                  />
                </div>
                <Button onClick={saveSettings} disabled={busy || !settingsDirty}>
                  Enregistrer les réglages
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Joueurs */}
        <TabsContent value="players">
          <Card>
            <CardHeader>
              <CardTitle>Joueurs ({activePlayers.length} actif(s) / {players.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    value={newPlayerIdentifier}
                    onChange={(e) => setNewPlayerIdentifier(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPlayer();
                      }
                    }}
                    placeholder="Email, username#0000, ou nom d'un invité"
                    maxLength={150}
                  />
                  <Button onClick={addPlayer} disabled={busy || !newPlayerIdentifier.trim()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Un email ou un tag <code>username#0000</code> lie le joueur à son compte ; un
                  email inconnu crée un compte, tout autre texte ajoute un invité.
                </p>
              </div>

              {players.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun joueur inscrit pour le moment.</p>
              ) : (
                <ul className="divide-y">
                  {players.map((player) => (
                    <li key={player.id} className="flex items-center justify-between py-3">
                      <div>
                        <span className="font-medium">{player.displayName}</span>
                        {!player.userId && (
                          <span className="ml-2 text-xs text-muted-foreground">Invité</span>
                        )}
                        {player.status === "dropped" && (
                          <Badge variant="outline" className="ml-2">
                            Drop
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <PlayerSyncQRButton
                          tournamentId={tournamentId}
                          playerName={player.displayName}
                          syncKey={player.syncKey}
                        />
                        {player.status === "dropped" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => reactivatePlayer(player)}
                            disabled={busy}
                          >
                            Réactiver
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-800"
                            onClick={() => removePlayer(player)}
                            disabled={busy}
                            aria-label={`Retirer ${player.displayName}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phases */}
        <TabsContent value="phases">
          <Card>
            <CardHeader>
              <CardTitle>Phases</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {phases.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune phase configurée.</p>
              ) : (
                <ul className="space-y-3">
                  {phases.map((phase) => {
                    const lastRound = lastRoundByPhase.get(phase.id);
                    return (
                      <li key={phase.id} className="flex items-center justify-between border rounded-lg p-4">
                        <div>
                          <div className="font-medium">{phase.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {PHASE_TYPE_LABELS[phase.type]} · best-of-{phase.bestOf}
                            {` · ${phase.resultMode === "points" ? "points" : "sélection"}`}
                            {` · ${phase.scoringMethod === "rank_offset" ? "rang" : "points fixes"}`}
                            {phase.plannedRounds ? ` · ${phase.plannedRounds} rondes` : ""}
                            {phase.topCut ? ` · Top ${phase.topCut}` : ""}
                            {phase.type !== "bracket" && (
                              <>
                                {" · "}
                                {phase.minPlayersPerMatch === phase.maxPlayersPerMatch
                                  ? phase.minPlayersPerMatch === 2
                                    ? "duels"
                                    : `pods de ${phase.minPlayersPerMatch}`
                                  : `pods ${phase.minPlayersPerMatch}-${phase.maxPlayersPerMatch}`}
                              </>
                            )}
                            {lastRound ? ` · ${lastRound.number} ronde(s)` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{PHASE_STATUS_LABELS[phase.status]}</Badge>
                          {lastRound && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteLastRound(lastRound)}
                              disabled={busy}
                            >
                              Supprimer la ronde {lastRound.number}
                            </Button>
                          )}
                          {phase.type !== "freeform" && phase.status !== "completed" && (
                            <Button size="sm" onClick={() => generateRound(phase)} disabled={busy}>
                              Générer une ronde
                            </Button>
                          )}
                          {phase.status === "not-started" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-800"
                              onClick={() => deletePhase(phase)}
                              disabled={busy}
                              aria-label={`Supprimer la phase ${phase.name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="border-t pt-6 space-y-4">
                <h3 className="font-medium">Ajouter une phase</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="phase-name">Nom</Label>
                    <Input
                      id="phase-name"
                      value={phaseName}
                      onChange={(e) => setPhaseName(e.target.value)}
                      placeholder="Ex: Phase de poules"
                      maxLength={200}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={phaseType} onValueChange={(v) => setPhaseType(v as TournamentPhaseType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="swiss">Rondes suisses</SelectItem>
                        <SelectItem value="elimination">Élimination (ré-appariement)</SelectItem>
                        <SelectItem value="bracket">Arbre d&apos;élimination</SelectItem>
                        <SelectItem value="freeform">Format libre</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phase-bestof">Best-of-n (parties par match)</Label>
                    <Input
                      id="phase-bestof"
                      type="number"
                      min={1}
                      max={9}
                      value={phaseBestOf}
                      onChange={(e) => setPhaseBestOf(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Résultat des parties</Label>
                    <Select
                      value={phaseResultMode}
                      onValueChange={(v) => setPhaseResultMode(v as TournamentResultMode)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="selection">Désignation du vainqueur</SelectItem>
                        <SelectItem value="points">Saisie des points</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Méthode de scoring</Label>
                    <Select
                      value={phaseScoringMethod}
                      onValueChange={(v) => setPhaseScoringMethod(v as TournamentScoringMethod)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fixed">Points fixes (victoire/défaite/nul)</SelectItem>
                        <SelectItem value="rank_offset">Selon le rang (N + offset)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {phaseScoringMethod === "fixed" && (
                    <div className="space-y-2 md:col-span-2">
                      <Label>Points fixes (victoire / défaite / nul)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label="Points de victoire"
                          type="number"
                          className="w-20"
                          value={phaseWin}
                          onChange={(e) => setPhaseWin(e.target.value)}
                        />
                        <Input
                          aria-label="Points de défaite"
                          type="number"
                          className="w-20"
                          value={phaseLoss}
                          onChange={(e) => setPhaseLoss(e.target.value)}
                        />
                        <Input
                          aria-label="Points de match nul"
                          type="number"
                          className="w-20"
                          value={phaseDraw}
                          onChange={(e) => setPhaseDraw(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  {phaseScoringMethod === "rank_offset" && (
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="phase-offsets">Offsets par rang (séparés par des virgules)</Label>
                      <Input
                        id="phase-offsets"
                        value={phaseRankOffsets}
                        onChange={(e) => setPhaseRankOffsets(e.target.value)}
                        placeholder="3,1,-1,-3,-4,-5,-7"
                      />
                      <p className="text-xs text-muted-foreground">
                        Points = N + offset[rang], N étant le nombre de joueurs du match.
                      </p>
                    </div>
                  )}
                  {phaseType === "elimination" && (
                    <div className="space-y-2">
                      <Label>Ré-appariement des vainqueurs</Label>
                      <Select
                        value={phaseSeeding}
                        onValueChange={(v) => setPhaseSeeding(v as TournamentEliminationSeeding)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standings">Selon le classement</SelectItem>
                          <SelectItem value="random">Aléatoire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {phaseType === "swiss" && (
                    <div className="space-y-2">
                      <Label htmlFor="phase-rounds">Nombre de rondes (optionnel)</Label>
                      <Input
                        id="phase-rounds"
                        type="number"
                        min={1}
                        value={phaseRounds}
                        onChange={(e) => setPhaseRounds(e.target.value)}
                      />
                    </div>
                  )}
                  {phaseType !== "freeform" && (
                    <div className="space-y-2">
                      <Label htmlFor="phase-topcut">Top cut à l&apos;entrée (optionnel)</Label>
                      <Input
                        id="phase-topcut"
                        type="number"
                        min={2}
                        value={phaseTopCut}
                        onChange={(e) => setPhaseTopCut(e.target.value)}
                        placeholder="Ex: 8"
                      />
                    </div>
                  )}
                </div>

                {/* Bornes de joueurs par match (le bracket est toujours en duel). */}
                {phaseType !== "bracket" && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Joueurs par match</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPhaseMinPlayers("2");
                          setPhaseMaxPlayers("2");
                        }}
                      >
                        Duel (2-2)
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id="phase-min-players"
                        aria-label="Minimum de joueurs par match"
                        type="number"
                        min={2}
                        max={16}
                        className="w-24"
                        value={phaseMinPlayers}
                        onChange={(e) => setPhaseMinPlayers(e.target.value)}
                      />
                      <span className="text-muted-foreground">à</span>
                      <Input
                        id="phase-max-players"
                        aria-label="Maximum de joueurs par match"
                        type="number"
                        min={2}
                        max={16}
                        className="w-24"
                        value={phaseMaxPlayers}
                        onChange={(e) => setPhaseMaxPlayers(e.target.value)}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      2-2 pour des duels ; un intervalle plus large génère des pods multijoueurs.
                    </p>
                  </div>
                )}
                <Button onClick={addPhase} disabled={busy || !phaseName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter la phase
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Historique */}
        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Historique des rondes</CardTitle>
            </CardHeader>
            <CardContent>
              <RoundHistoryBrowser tournamentId={tournamentId} canManage />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap justify-between gap-2">
        <Button variant="outline" asChild>
          <Link href="/tournaments">Retour à mes tournois</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/tournaments/${tournamentId}/player`}>Voir le portail joueur</Link>
        </Button>
      </div>
    </div>
  );
}
