"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function SettingsSection({ tournament }: { tournament: Tournament }) {
  const tournamentId = tournament.id;
  const [status, setStatus] = useState<Tournament["status"]>(tournament.status);
  const [allowSelfReporting, setAllowSelfReporting] = useState(tournament.settings.allowSelfReporting);
  const [requireConfirmation, setRequireConfirmation] = useState(tournament.settings.requireConfirmation);
  const [savedSettings, setSavedSettings] = useState({
    allowSelfReporting: tournament.settings.allowSelfReporting,
    requireConfirmation: tournament.settings.requireConfirmation,
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

  const saveSettings = async () => {
    if (await patch({ settings: { allowSelfReporting, requireConfirmation } })) {
      setSavedSettings({ allowSelfReporting, requireConfirmation });
    }
  };

  const settingsDirty =
    allowSelfReporting !== savedSettings.allowSelfReporting ||
    requireConfirmation !== savedSettings.requireConfirmation;

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
            <Button onClick={saveSettings} disabled={busy || !settingsDirty}>
              Enregistrer les réglages
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
