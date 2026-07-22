"use client";

import { useCallback, useEffect, useState } from "react";
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
import type {
  Tournament,
  TournamentPhase,
  TournamentPlayer,
  TournamentPhaseType,
  TournamentMatchFormat,
} from "@/lib/types/Tournament";
import { PlayerSyncQRButton } from "./PlayerSyncQRButton";

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

const PHASE_TYPE_LABELS: Record<TournamentPhaseType, string> = {
  freeform: "Format libre",
  swiss: "Rondes suisses",
  bracket: "Élimination directe",
};

const PHASE_STATUS_LABELS: Record<string, string> = {
  "not-started": "Non démarrée",
  "in-progress": "En cours",
  completed: "Terminée",
};

const MATCH_FORMATS: TournamentMatchFormat[] = ["BO1", "BO2", "BO3", "BO5"];

type Props = {
  tournament: Tournament;
  initialPlayers: TournamentPlayer[];
  initialPhases: TournamentPhase[];
};

export function OrganizerClient({ tournament, initialPlayers, initialPhases }: Props) {
  const [players, setPlayers] = useState<TournamentPlayer[]>(initialPlayers);
  const [phases, setPhases] = useState<TournamentPhase[]>(initialPhases);
  const [status, setStatus] = useState<Tournament["status"]>(tournament.status);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Ajout de joueur : email, username#discriminator, ou simple nom (invité).
  const [newPlayerIdentifier, setNewPlayerIdentifier] = useState("");

  // Ajout de phase
  const [phaseName, setPhaseName] = useState("");
  const [phaseType, setPhaseType] = useState<TournamentPhaseType>("swiss");
  const [phaseFormat, setPhaseFormat] = useState<TournamentMatchFormat>("BO3");
  const [phaseRounds, setPhaseRounds] = useState("");
  const [phaseTopCut, setPhaseTopCut] = useState("");

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
        matchFormat: phaseFormat,
      };
      // N'ajouter le champ que si la saisie donne un entier positif : un NaN
      // (champ vide, "e"…) serait sérialisé en null par JSON.stringify et
      // rejeté par la validation de l'API.
      const parsedRounds = Number.parseInt(phaseRounds, 10);
      if (phaseType === "swiss" && Number.isFinite(parsedRounds) && parsedRounds > 0) {
        body.plannedRounds = parsedRounds;
      }
      const parsedTopCut = Number.parseInt(phaseTopCut, 10);
      if (phaseType === "bracket" && Number.isFinite(parsedTopCut) && parsedTopCut > 1) {
        body.topCut = parsedTopCut;
      }
      await api(`/api/tournaments/${tournamentId}/phases`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setPhaseName("");
      setPhaseRounds("");
      setPhaseTopCut("");
      await refreshPhases();
    });

  const deletePhase = (phase: TournamentPhase) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}/phases/${phase.id}`, { method: "DELETE" });
      await refreshPhases();
    });

  const generateRound = (phase: TournamentPhase) =>
    run(async () => {
      const round = await api(`/api/tournaments/${tournamentId}/phases/${phase.id}/rounds`, {
        method: "POST",
      });
      await refreshPhases();
      window.location.href = `/tournaments/${tournamentId}/organizer/rounds/${round.id}`;
    });

  const changeStatus = (next: Tournament["status"]) =>
    run(async () => {
      await api(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setStatus(next);
    });

  useEffect(() => {
    // Reflète le statut si un autre onglet l'a modifié au montage.
    setStatus(tournament.status);
  }, [tournament.status]);

  const activePlayers = players.filter((p) => p.status === "active");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{tournament.name}</h1>
          <p className="text-muted-foreground mt-1">Portail organisateur</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{TOURNAMENT_STATUS_LABELS[status] ?? status}</Badge>
          <Select value={status} onValueChange={(v) => changeStatus(v as Tournament["status"])}>
            <SelectTrigger className="w-[150px]" disabled={busy}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">À venir</SelectItem>
              <SelectItem value="in-progress">En cours</SelectItem>
              <SelectItem value="completed">Terminé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Joueurs */}
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

      {/* Phases */}
      <Card>
        <CardHeader>
          <CardTitle>Phases</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune phase configurée.</p>
          ) : (
            <ul className="space-y-3">
              {phases.map((phase) => (
                <li
                  key={phase.id}
                  className="flex items-center justify-between border rounded-lg p-4"
                >
                  <div>
                    <div className="font-medium">{phase.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {PHASE_TYPE_LABELS[phase.type]} · {phase.matchFormat}
                      {phase.plannedRounds ? ` · ${phase.plannedRounds} rondes` : ""}
                      {phase.topCut ? ` · Top ${phase.topCut}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{PHASE_STATUS_LABELS[phase.status]}</Badge>
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
              ))}
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
                    <SelectItem value="bracket">Élimination directe</SelectItem>
                    <SelectItem value="freeform">Format libre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Format des matchs</Label>
                <Select
                  value={phaseFormat}
                  onValueChange={(v) => setPhaseFormat(v as TournamentMatchFormat)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATCH_FORMATS.map((format) => (
                      <SelectItem key={format} value={format}>
                        {format}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              {phaseType === "bracket" && (
                <div className="space-y-2">
                  <Label htmlFor="phase-topcut">Top cut (optionnel)</Label>
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
            <Button onClick={addPhase} disabled={busy || !phaseName.trim()}>
              <Plus className="h-4 w-4 mr-2" />
              Ajouter la phase
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
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
