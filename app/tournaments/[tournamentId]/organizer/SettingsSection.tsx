"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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

// Valeur sentinelle du Select de jeu (un SelectItem ne peut pas être vide).
const NO_GAME = "none";

const TOURNAMENT_STATUSES: Tournament["status"][] = ["draft", "in-progress", "completed"];

export function SettingsSection({
  tournament,
  games,
  canDelete = true,
}: {
  tournament: Tournament;
  games: { id: string; name: string }[];
  /** La suppression est réservée aux organisateurs (pas aux arbitres). */
  canDelete?: boolean;
}) {
  const t = useTranslations("Tournaments");
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
        throw new Error(data.error ?? t("common.error"));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
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
        throw new Error(data.error ?? t("organizerSettings.deleteError"));
      }
      router.push("/tournaments");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : t("organizerSettings.deleteError"));
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
          <CardTitle>{t("organizerSettings.title")}</CardTitle>
          <Badge variant="secondary">
            {TOURNAMENT_STATUSES.includes(status) ? t(`common.tournamentStatus.${status}`) : status}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>{t("organizerSettings.statusLabel")}</Label>
            <Select value={status} onValueChange={(v) => changeStatus(v as Tournament["status"])}>
              <SelectTrigger className="w-[200px]" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TOURNAMENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`common.tournamentStatus.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="setting-game">{t("organizerSettings.gameLabel")}</Label>
            <Select value={gameId} onValueChange={changeGame}>
              <SelectTrigger id="setting-game" className="w-[280px]" disabled={busy}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_GAME}>{t("organizerSettings.noGame")}</SelectItem>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
                {gameId !== NO_GAME && !games.some((g) => g.id === gameId) && (
                  <SelectItem value={gameId}>{t("organizerSettings.unknownGame")}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4 border-t pt-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="setting-self-reporting">
                  {t("organizerSettings.selfReportingLabel")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("organizerSettings.selfReportingHint")}
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
                <Label htmlFor="setting-confirmation">
                  {t("organizerSettings.confirmationLabel")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("organizerSettings.confirmationHint")}
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
                <Label htmlFor="setting-pre-registration">
                  {t("organizerSettings.preRegistrationLabel")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("organizerSettings.preRegistrationHint")}
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
              {t("organizerSettings.saveSettings")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {canDelete && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">{t("organizerSettings.dangerZone")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {t("organizerSettings.dangerDescription")}
            </p>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t("organizerSettings.deleteTournament")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={deleteOpen}
        onOpenChange={(o) => {
          if (!deleting) setDeleteOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("organizerSettings.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("organizerSettings.deleteDialogDescription", { name: tournament.name })}
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
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting
                ? t("organizerSettings.deleting")
                : t("organizerSettings.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
