"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Import, Link2, Link2Off, Loader2, Trophy } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TournamentPlayerStatus } from "@/lib/types/Tournament";

type ImportPlan = {
  toAdd: { displayName: string; userId?: string; status: TournamentPlayerStatus }[];
  toUpdate: {
    playerId: string;
    displayName: string;
    discriminator?: string;
    currentStatus: TournamentPlayerStatus;
    newStatus: TournamentPlayerStatus;
  }[];
  unchangedCount: number;
  existingPlayersCount: number;
};

/**
 * Carte « Tournoi » de la page d'un événement (créateur uniquement) : lie un
 * tournoi organisé par l'utilisateur à l'événement, et importe les inscrits de
 * l'événement dans le tournoi (aperçu en modale quand le tournoi a déjà des
 * joueurs).
 */
export function TournamentLinkCard({
  eventId,
  tournament,
}: {
  eventId: string;
  tournament: { id: string; name: string } | null;
}) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Liaison d'un tournoi existant.
  const [myTournaments, setMyTournaments] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedId, setSelectedId] = useState("");

  // Import des inscrits.
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const statusLabel = (status: TournamentPlayerStatus) => t(`common.playerStatus.${status}`);

  const loadMyTournaments = async () => {
    if (myTournaments) return;
    try {
      const res = await fetch("/api/tournaments");
      if (!res.ok) return;
      const data: { id: string; name: string; eventId?: string }[] = await res.json();
      // Ne proposer que les tournois pas déjà liés à un autre événement.
      setMyTournaments(
        data.filter((entry) => !entry.eventId || entry.eventId === eventId)
      );
    } catch {
      // silencieux : la liste restera vide
    }
  };

  const patchTournament = async (tournamentId: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
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
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const link = () => selectedId && patchTournament(selectedId, { eventId });
  const unlink = () => tournament && patchTournament(tournament.id, { eventId: null });

  const runImport = async () => {
    if (!tournament) return;
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/import-event-players`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("eventLink.importError"));
      }
      const result: { added: number; updated: number } = await res.json();
      setSuccess(t("eventLink.importSuccess", { added: result.added, updated: result.updated }));
      setImportOpen(false);
      setPlan(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("eventLink.importError"));
    } finally {
      setImporting(false);
    }
  };

  const openImport = async () => {
    if (!tournament) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/tournaments/${tournament.id}/import-event-players`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? t("eventLink.importError"));
      }
      const fetched: ImportPlan = await res.json();
      // Tournoi encore vide : import direct, sans modale de confirmation.
      if (fetched.existingPlayersCount === 0) {
        setBusy(false);
        await runImport();
        return;
      }
      setPlan(fetched);
      setImportOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("eventLink.importError"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5" />
          {t("eventLink.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        {tournament ? (
          <>
            <p className="text-sm">
              <span className="font-medium">{tournament.name}</span>
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/tournaments/${tournament.id}/organizer`}>
                  {t("eventLink.openOrganizerPortal")}
                </Link>
              </Button>
              <Button size="sm" onClick={openImport} disabled={busy || importing}>
                {busy || importing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Import className="mr-2 h-4 w-4" />
                )}
                {t("eventLink.importButton")}
              </Button>
              <Button variant="ghost" size="sm" onClick={unlink} disabled={busy}>
                <Link2Off className="mr-2 h-4 w-4" />
                {t("eventLink.unlink")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t("eventLink.noneLinked")}</p>
            <Select
              value={selectedId}
              onValueChange={setSelectedId}
              onOpenChange={(open) => open && loadMyTournaments()}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("eventLink.selectPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {(myTournaments ?? []).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
                {myTournaments && myTournaments.length === 0 && (
                  <p className="px-2 py-1.5 text-sm text-muted-foreground">
                    {t("eventLink.noTournaments")}
                  </p>
                )}
              </SelectContent>
            </Select>
            <Button size="sm" className="w-full" onClick={link} disabled={busy || !selectedId}>
              <Link2 className="mr-2 h-4 w-4" />
              {t("eventLink.linkButton")}
            </Button>
          </>
        )}

        <Dialog
          open={importOpen}
          onOpenChange={(open) => {
            if (!importing) setImportOpen(open);
          }}
        >
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("eventLink.importDialogTitle")}</DialogTitle>
              <DialogDescription>{t("eventLink.importDialogDescription")}</DialogDescription>
            </DialogHeader>

            {plan && (
              <div className="space-y-4">
                <div>
                  <p className="mb-1 text-sm font-medium">
                    {t("eventLink.toAddTitle", { count: plan.toAdd.length })}
                  </p>
                  {plan.toAdd.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("eventLink.noneToAdd")}</p>
                  ) : (
                    <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
                      {plan.toAdd.map((entry, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 px-3 py-1.5">
                          <span className="truncate">{entry.displayName}</span>
                          <Badge variant="secondary">{statusLabel(entry.status)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="mb-1 text-sm font-medium">
                    {t("eventLink.toUpdateTitle", { count: plan.toUpdate.length })}
                  </p>
                  {plan.toUpdate.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("eventLink.noneToUpdate")}</p>
                  ) : (
                    <ul className="max-h-48 divide-y overflow-y-auto rounded-md border text-sm">
                      {plan.toUpdate.map((entry) => (
                        <li
                          key={entry.playerId}
                          className="flex items-center justify-between gap-2 px-3 py-1.5"
                        >
                          <span className="truncate">
                            {entry.displayName}
                            {entry.discriminator && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                #{entry.discriminator}
                              </span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <Badge variant="outline">{statusLabel(entry.currentStatus)}</Badge>
                            <span className="text-muted-foreground">→</span>
                            <Badge variant="secondary">{statusLabel(entry.newStatus)}</Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {plan.unchangedCount > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("eventLink.unchangedCount", { count: plan.unchangedCount })}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setImportOpen(false)}
                disabled={importing}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="button"
                onClick={runImport}
                disabled={
                  importing || !plan || (plan.toAdd.length === 0 && plan.toUpdate.length === 0)
                }
              >
                {importing ? t("eventLink.importing") : t("eventLink.importConfirm")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
