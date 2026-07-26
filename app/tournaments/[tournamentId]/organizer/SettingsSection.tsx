"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Tournament, TournamentPhaseType } from "@/lib/types/Tournament";
import { JoinTournamentCard } from "./JoinTournamentCard";
import { OrganizerPageHeader } from "./OrganizerPageHeader";

// Valeur sentinelle du Select de jeu (un SelectItem ne peut pas être vide).
const NO_GAME = "none";

const TOURNAMENT_STATUSES: Tournament["status"][] = ["draft", "in-progress", "completed"];

type PhaseSummary = {
  name: string;
  type: TournamentPhaseType;
  bestOf: number;
  plannedRounds?: number;
  topCut?: number;
};

export function SettingsSection({
  tournament,
  games,
  canDelete = true,
  joinCode,
  phases = [],
  registeredCount = 0,
}: {
  tournament: Tournament;
  games: { id: string; name: string }[];
  /** La suppression est réservée aux organisateurs (pas aux arbitres). */
  canDelete?: boolean;
  joinCode?: string;
  phases?: PhaseSummary[];
  registeredCount?: number;
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const tournamentId = tournament.id;

  const [status, setStatus] = useState<Tournament["status"]>(tournament.status);
  const [gameId, setGameId] = useState(tournament.gameId ?? NO_GAME);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Informations pratiques. `startsAt` est édité en deux champs (jour et heure)
  // et recomposé en instant à l'enregistrement.
  const initialStart = tournament.startsAt ? DateTime.fromJSDate(new Date(tournament.startsAt)) : null;
  const [name, setName] = useState(tournament.name);
  const [location, setLocation] = useState(tournament.location ?? "");
  const [startDate, setStartDate] = useState(initialStart?.toFormat("yyyy-MM-dd") ?? "");
  const [startTime, setStartTime] = useState(initialStart?.toFormat("HH:mm") ?? "");
  const [capacity, setCapacity] = useState(
    tournament.capacity !== undefined ? String(tournament.capacity) : ""
  );
  const [savedDetails, setSavedDetails] = useState({
    name: tournament.name,
    location: tournament.location ?? "",
    startDate: initialStart?.toFormat("yyyy-MM-dd") ?? "",
    startTime: initialStart?.toFormat("HH:mm") ?? "",
    capacity: tournament.capacity !== undefined ? String(tournament.capacity) : "",
  });

  const [allowSelfReporting, setAllowSelfReporting] = useState(tournament.settings.allowSelfReporting);
  const [requireConfirmation, setRequireConfirmation] = useState(tournament.settings.requireConfirmation);
  const [preRegistration, setPreRegistration] = useState(tournament.settings.preRegistration);
  const [firstTable, setFirstTable] = useState(String(tournament.settings.firstTableNumber ?? 1));
  const [savedSettings, setSavedSettings] = useState({
    allowSelfReporting: tournament.settings.allowSelfReporting,
    requireConfirmation: tournament.settings.requireConfirmation,
    preRegistration: tournament.settings.preRegistration,
    firstTable: String(tournament.settings.firstTableNumber ?? 1),
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

  const saveDetails = async () => {
    // La date seule suffit (heure optionnelle, minuit par défaut) ; sans date,
    // l'instant est retiré.
    const startsAt = startDate
      ? DateTime.fromISO(`${startDate}T${startTime || "00:00"}`).toJSDate().toISOString()
      : null;
    const parsedCapacity = Number.parseInt(capacity, 10);

    const ok = await patch({
      name: name.trim() || tournament.name,
      location: location.trim() ? location.trim() : null,
      startsAt,
      capacity: Number.isFinite(parsedCapacity) && parsedCapacity > 0 ? parsedCapacity : null,
    });
    if (ok) {
      setSavedDetails({ name, location, startDate, startTime, capacity });
      router.refresh();
    }
  };

  const saveSettings = async () => {
    // Numéro de première table : entier ≥ 0, sinon retombe sur 1.
    const parsedFirstTable = Number.parseInt(firstTable, 10);
    const firstTableNumber =
      Number.isFinite(parsedFirstTable) && parsedFirstTable >= 0 ? parsedFirstTable : 1;
    if (
      await patch({
        settings: { allowSelfReporting, requireConfirmation, preRegistration, firstTableNumber },
      })
    ) {
      setFirstTable(String(firstTableNumber));
      setSavedSettings({
        allowSelfReporting,
        requireConfirmation,
        preRegistration,
        firstTable: String(firstTableNumber),
      });
    }
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

  const detailsDirty =
    name !== savedDetails.name ||
    location !== savedDetails.location ||
    startDate !== savedDetails.startDate ||
    startTime !== savedDetails.startTime ||
    capacity !== savedDetails.capacity;

  const settingsDirty =
    allowSelfReporting !== savedSettings.allowSelfReporting ||
    requireConfirmation !== savedSettings.requireConfirmation ||
    preRegistration !== savedSettings.preRegistration ||
    firstTable !== savedSettings.firstTable;

  // Résumé du format tel que les joueurs le liront : enchaînement des phases.
  const formatSummary =
    phases.length === 0
      ? t("organizerSettings.summaryNoPhase")
      : phases
          .map((p) => {
            const rounds = p.plannedRounds
              ? ` ${t("organizerPhases.summary.roundsCount", { count: p.plannedRounds })}`
              : "";
            const cut = p.topCut ? ` (${t("organizerPhases.summary.topN", { count: p.topCut })})` : "";
            return `${t(`common.phaseType.${p.type}`)}${rounds}${cut}`;
          })
          .join(" + ");

  const toggles: {
    id: string;
    labelKey: string;
    hintKey: string;
    checked: boolean;
    onChange: (v: boolean) => void;
  }[] = [
    {
      id: "setting-self-reporting",
      labelKey: "organizerSettings.selfReportingLabel",
      hintKey: "organizerSettings.selfReportingHint",
      checked: allowSelfReporting,
      onChange: setAllowSelfReporting,
    },
    {
      id: "setting-confirmation",
      labelKey: "organizerSettings.confirmationLabel",
      hintKey: "organizerSettings.confirmationHint",
      checked: requireConfirmation,
      onChange: setRequireConfirmation,
    },
    {
      id: "setting-pre-registration",
      labelKey: "organizerSettings.preRegistrationLabel",
      hintKey: "organizerSettings.preRegistrationHint",
      checked: preRegistration,
      onChange: setPreRegistration,
    },
  ];

  return (
    <div>
      <OrganizerPageHeader
        title={t("organizerSettings.pageTitle")}
        description={t("organizerSettings.pageDescription")}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-5 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4 xl:max-w-2xl">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3.5 text-sm font-semibold">{t("organizerSettings.infoTitle")}</h2>
            <div className="grid gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="setting-name">{t("organizerSettings.nameLabel")}</Label>
                <Input
                  id="setting-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={200}
                  disabled={busy}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="setting-game">{t("organizerSettings.gameLabel")}</Label>
                  <Select value={gameId} onValueChange={changeGame}>
                    <SelectTrigger id="setting-game" className="w-full" disabled={busy}>
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
                <div className="space-y-1.5">
                  <Label htmlFor="setting-location">{t("organizerSettings.locationLabel")}</Label>
                  <Input
                    id="setting-location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t("organizerSettings.locationPlaceholder")}
                    maxLength={200}
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="setting-date">{t("organizerSettings.dateLabel")}</Label>
                  <Input
                    id="setting-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={busy}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setting-time">{t("organizerSettings.timeLabel")}</Label>
                  <Input
                    id="setting-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={busy || !startDate}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="setting-capacity">{t("organizerSettings.capacityLabel")}</Label>
                  <Input
                    id="setting-capacity"
                    type="number"
                    min={1}
                    max={100000}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
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

              <Button className="justify-self-start" onClick={saveDetails} disabled={busy || !detailsDirty}>
                {t("common.save")}
              </Button>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">{t("organizerSettings.reportingTitle")}</h2>
            <p className="mb-3.5 mt-0.5 text-[13px] text-muted-foreground">
              {t("organizerSettings.reportingDescription")}
            </p>
            <div className="flex flex-col gap-2.5">
              {toggles.map((toggle) => (
                <div
                  key={toggle.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-3"
                >
                  <div>
                    <Label htmlFor={toggle.id} className="text-sm font-semibold">
                      {t(toggle.labelKey)}
                    </Label>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">{t(toggle.hintKey)}</p>
                  </div>
                  <Switch
                    id={toggle.id}
                    checked={toggle.checked}
                    onCheckedChange={toggle.onChange}
                    disabled={busy}
                  />
                </div>
              ))}
              <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                <div>
                  <Label htmlFor="setting-first-table" className="text-sm font-semibold">
                    {t("organizerSettings.firstTableLabel")}
                  </Label>
                  <p className="mt-0.5 text-[13px] text-muted-foreground">
                    {t("organizerSettings.firstTableHint")}
                  </p>
                </div>
                <Input
                  id="setting-first-table"
                  type="number"
                  min={0}
                  max={9999}
                  className="w-24"
                  value={firstTable}
                  onChange={(e) => setFirstTable(e.target.value)}
                  disabled={busy}
                />
              </div>
            </div>
            <Button className="mt-3" onClick={saveSettings} disabled={busy || !settingsDirty}>
              {t("organizerSettings.saveSettings")}
            </Button>
          </section>

          {canDelete && (
            <section className="rounded-xl border border-destructive/40 bg-card p-4">
              <h2 className="text-sm font-semibold text-destructive">
                {t("organizerSettings.dangerZone")}
              </h2>
              <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
                {t("organizerSettings.dangerDescription")}
              </p>
              <Button variant="outline" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-4" />
                {t("organizerSettings.deleteTournament")}
              </Button>
            </section>
          )}
        </div>

        <div className="flex w-full shrink-0 flex-col gap-3.5 xl:w-[320px]">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2.5 text-sm font-semibold">{t("organizerSettings.summaryTitle")}</h2>
            <dl className="text-[13px]">
              <div className="flex justify-between gap-3 py-1">
                <dt className="text-muted-foreground">{t("organizerSettings.summaryFormat")}</dt>
                <dd className="text-right font-semibold">{formatSummary}</dd>
              </div>
              {phases[0] && (
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-muted-foreground">{t("organizerSettings.summaryMatch")}</dt>
                  <dd className="text-right font-semibold">
                    {t("common.bestOfN", { count: phases[0].bestOf })}
                  </dd>
                </div>
              )}
              <div className="flex justify-between gap-3 py-1">
                <dt className="text-muted-foreground">{t("organizerSettings.summaryRegistered")}</dt>
                <dd className="text-right font-semibold">
                  {tournament.capacity
                    ? `${registeredCount} / ${tournament.capacity}`
                    : registeredCount}
                </dd>
              </div>
              {tournament.location && (
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-muted-foreground">{t("organizerSettings.summaryLocation")}</dt>
                  <dd className="text-right font-semibold">{tournament.location}</dd>
                </div>
              )}
              {tournament.startsAt && (
                <div className="flex justify-between gap-3 py-1">
                  <dt className="text-muted-foreground">{t("organizerSettings.summaryStart")}</dt>
                  <dd className="text-right font-semibold">
                    {DateTime.fromJSDate(new Date(tournament.startsAt)).toFormat("dd/MM/yyyy HH:mm")}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {joinCode && <JoinTournamentCard code={joinCode} />}

          <section className="rounded-xl border bg-muted/40 p-4">
            <h2 className="mb-1.5 text-[13px] font-semibold">
              {t("organizerSettings.firstTimeTitle")}
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground [text-wrap:pretty]">
              {t("organizerSettings.firstTimeBody")}
            </p>
          </section>
        </div>
      </div>

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
            <Button type="button" variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? t("organizerSettings.deleting") : t("organizerSettings.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
