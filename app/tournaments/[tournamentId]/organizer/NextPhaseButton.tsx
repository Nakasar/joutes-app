"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Entry = { playerId: string; displayName: string };
type Transition = {
  currentPhase: { id: string; name: string } | null;
  currentPhaseComplete: boolean;
  nextPhase: { id: string; name: string; type: string; topCut?: number } | null;
  qualification: { qualified: Entry[]; eliminated: Entry[]; topCut?: number } | null;
};

export function NextPhaseButton({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transition, setTransition] = useState<Transition | null>(null);

  const openDialog = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/next-phase`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("nextPhase.loadError"));
      }
      const data: Transition = await res.json();
      if (!data.nextPhase) {
        setError(t("nextPhase.noNextPhase"));
        return;
      }
      setTransition(data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("nextPhase.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/next-phase`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? t("nextPhase.advanceError"));
      }
      const round = await res.json();
      // Redirige vers la saisie des résultats de la première ronde créée.
      router.push(`/tournaments/${tournamentId}/organizer/rounds/${round.id}/matches`);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("nextPhase.advanceError"));
      setBusy(false);
    }
  };

  const next = transition?.nextPhase;
  const qualified = transition?.qualification?.qualified ?? [];
  const eliminated = transition?.qualification?.eliminated ?? [];
  const hasCut = (transition?.qualification?.topCut ?? 0) > 0 && eliminated.length > 0;
  const currentIncomplete = transition?.currentPhaseComplete === false;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={openDialog} disabled={loading} variant="outline">
        <ArrowRight className="mr-2 h-4 w-4" />
        {t("nextPhase.button")}
      </Button>
      {error && !open && <p className="text-xs text-destructive">{error}</p>}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("nextPhase.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {transition?.currentPhase
                ? `${t("nextPhase.currentPhaseClosing", {
                    name: transition.currentPhase.name,
                  })} `
                : ""}
              {next ? t("nextPhase.nextPhaseStarting", { name: next.name }) : ""}
            </DialogDescription>
          </DialogHeader>

          {currentIncomplete && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {t("nextPhase.currentIncomplete")}
            </div>
          )}

          {hasCut && (
            <div className="space-y-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {t("nextPhase.topCutWarning", {
                  count: eliminated.length,
                  topCut: transition?.qualification?.topCut ?? 0,
                })}
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">
                  {t("nextPhase.qualifiedPlayers", { count: qualified.length })}
                </p>
                <ol className="max-h-56 divide-y overflow-y-auto rounded-md border text-sm">
                  {qualified.map((p, i) => (
                    <li key={p.playerId} className="px-3 py-1.5">
                      {i + 1}. {p.displayName}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {error && open && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={confirm} disabled={busy || !next || currentIncomplete}>
              {t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
