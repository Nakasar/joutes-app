"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Tournament } from "@/lib/types/Tournament";

const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

// Valeur sentinelle du Select de jeu (un SelectItem ne peut pas être vide).
const NO_GAME = "none";

export function SettingsSection({
  tournament,
  games,
}: {
  tournament: Tournament;
  games: { id: string; name: string }[];
}) {
  const router = useRouter();
  const tournamentId = tournament.id;
  const [status, setStatus] = useState<Tournament["status"]>(tournament.status);
  const [gameId, setGameId] = useState(tournament.gameId ?? NO_GAME);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [allowSelfReporting, setAllowSelfReporting] = useState(tournament.settings.allowSelfReporting);
  const [requireConfirmation, setRequireConfirmation] = useState(tournament.settings.requireConfirmation);
  const [preRegistration, setPreRegistration] = useState(tournament.settings.preRegistration);
  const [savedSettings, setSavedSettings] = useState({
    allowSelfReporting: tournament.settings.allowSelfReporting,
    requireConfirmation: tournament.settings.requireConfirmation,
    preRegistration: tournament.settings.preRegistration,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Une erreur est survenue");
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: Tournament["status"]) => {
    if (await patch({ status: next })) setStatus(next);
  };

  const changeGame = async (next: string) => {
    if (await patch({ gameId: next === NO_GAME ? null : next })) setGameId(next);
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Erreur lors de la suppression du tournoi");
      }
      router.push("/tournaments");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Erreur lors de la suppression du tournoi");
      setDeleting(false);
    }
  };

  const saveSettings = async () => {
    if (await patch({ settings: { allowSelfReporting, requireConfirmation, preRegistration } })) {
      setSavedSettings({ allowSelfReporting, requireConfirmation, preRegistration });
    }
  };

  const settingsDirty =
    allowSelfReporting !== savedSettings.allowSelfReporting ||
    requireConfirmation !== savedSettings.requireConfirmation ||
    preRegistration !== savedSettings.preRegistration;

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Configuration</CardTitle>
          <Badge variant="secondary">{TOURNAMENT_STATUS_LABELS[status] ?? status}</Badge>
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

          <div className="space-y-2">
            <Label htmlFor="setting-game">Jeu (optionnel)</Label>
            <Select value={gameId} onValueChange={changeGame}>
              <SelectTrigger id="setting-game" className="w-[280px]" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GAME}>Aucun jeu</SelectItem>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
                {gameId !== NO_GAME && !games.some((g) => g.id === gameId) && (
                  <SelectItem value={gameId}>Jeu inconnu</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="setting-self-reporting">Rapport de résultat par les joueurs</Label>
                <p className="mt-1 text-xs text-muted-foreground">
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
                <p className="mt-1 text-xs text-muted-foreground">
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
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="setting-pre-registration">Pré-inscription</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Les joueurs qui rejoignent le tournoi sont placés en PRE-REGISTERED, à confirmer
                  par un organisateur avant d&apos;être apparaillés.
                </p>
              </div>
              <Switch
                id="setting-pre-registration"
                checked={preRegistration}
                onCheckedChange={setPreRegistration}
                disabled={busy}
              />
            </div>
            <Button onClick={saveSettings} disabled={busy || !settingsDirty}>
              Enregistrer les réglages
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-destructive">Zone de danger</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Supprime définitivement le tournoi, ses joueurs, ses phases, ses rondes, ses matchs et
            ses annonces.
          </p>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            Supprimer le tournoi
          </Button>
        </CardContent>
      </Card>

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!deleting) setDeleteOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer le tournoi ?</DialogTitle>
            <DialogDescription>
              Le tournoi « {tournament.name} » et toutes ses données (joueurs, phases, rondes,
              matchs, annonces) seront supprimés définitivement. Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
            >
              Annuler
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? "Suppression..." : "Supprimer définitivement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
