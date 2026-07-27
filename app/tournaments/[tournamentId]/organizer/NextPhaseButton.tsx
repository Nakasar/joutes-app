"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Entry = { playerId: string; displayName: string };
type Transition = {
  currentPhase: { id: string; name: string } | null;
  currentPhaseComplete: boolean;
  nextPhase: { id: string; name: string; type: string; topCut?: number } | null;
  qualification: { qualified: Entry[]; eliminated: Entry[]; topCut?: number } | null;
};

type Step = 1 | 2 | 3;

/**
 * Passage à la phase suivante, en trois temps : ce qu'on vérifie avant de figer,
 * qui se qualifie, et contre qui. Le geste est irréversible pour les joueurs
 * éliminés — il mérite d'être déplié plutôt que confirmé d'un seul clic.
 */
export function NextPhaseButton({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("Tournaments");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>(1);
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
      setStep(1);
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
  const topCut = transition?.qualification?.topCut ?? 0;
  const currentIncomplete = transition?.currentPhaseComplete === false;

  // Appariements de la phase finale : tête de série 1 contre dernier qualifié,
  // 2 contre avant-dernier, etc. Simple aperçu — l'appariement réel est calculé
  // côté serveur au lancement, selon le seeding de la phase.
  const seeds = qualified
    .slice(0, Math.floor(qualified.length / 2))
    .map((high, index) => ({ high, low: qualified[qualified.length - 1 - index], index }));

  const checks: { key: string; ok: boolean }[] = [
    { key: "currentComplete", ok: !currentIncomplete },
    { key: "hasNextPhase", ok: !!next },
    { key: "hasQualified", ok: qualified.length > 0 },
  ];

  const steps: { value: Step; labelKey: string }[] = [
    { value: 1, labelKey: "nextPhase.stepChecks" },
    { value: 2, labelKey: "nextPhase.stepTopCut" },
    { value: 3, labelKey: "nextPhase.stepPairings" },
  ];

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={openDialog} disabled={loading} variant="outline">
        <ArrowRight className="size-4" />
        {t("nextPhase.button")}
      </Button>
      {error && !open && <p className="text-xs text-destructive">{error}</p>}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!busy) setOpen(o);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("nextPhase.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {transition?.currentPhase
                ? `${t("nextPhase.currentPhaseClosing", { name: transition.currentPhase.name })} `
                : ""}
              {next ? t("nextPhase.nextPhaseStarting", { name: next.name }) : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2.5">
            {steps.map((s, index) => (
              <div key={s.value} className="flex flex-1 items-center gap-2.5">
                <span
                  className={cn(
                    "flex items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold",
                    step >= s.value ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-5.5 items-center justify-center rounded-full text-xs",
                      step >= s.value
                        ? "bg-foreground text-background"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {s.value}
                  </span>
                  {t(s.labelKey)}
                </span>
                {index < steps.length - 1 && <span className="h-px flex-1 bg-border" />}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div>
              <p className="text-sm font-semibold">{t("nextPhase.checksTitle")}</p>
              <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">
                {t("nextPhase.checksDescription")}
              </p>
              <div className="flex flex-col gap-2">
                {checks.map((check) => (
                  <div
                    key={check.key}
                    className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full text-white",
                        check.ok ? "bg-emerald-600" : "bg-destructive"
                      )}
                    >
                      {check.ok ? (
                        <Check className="size-3" strokeWidth={3} />
                      ) : (
                        <X className="size-3" strokeWidth={3} />
                      )}
                    </span>
                    <span className="text-sm">{t(`nextPhase.checks.${check.key}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-sm font-semibold">{t("nextPhase.topCutTitle")}</p>
              <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">
                {t("nextPhase.topCutDescription")}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="min-w-0 flex-1 overflow-hidden rounded-xl border">
                  <p className="border-b bg-muted/50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    {t("nextPhase.qualifiedPlayers", { count: qualified.length })}
                  </p>
                  <ol className="max-h-64 divide-y overflow-y-auto text-[13px]">
                    {qualified.map((p, i) => (
                      <li key={p.playerId} className="flex gap-2.5 px-3 py-2">
                        <span className="font-mono text-muted-foreground">{i + 1}</span>
                        <span className="truncate">{p.displayName}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div className="w-full shrink-0 sm:w-56">
                  <div className="rounded-xl border p-3">
                    <p className="text-[13px] text-muted-foreground">
                      {t("nextPhase.eliminatedLabel")}
                    </p>
                    <p className="text-xl font-bold">
                      {t("nextPhase.eliminatedCount", { count: eliminated.length })}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("nextPhase.eliminatedHint")}
                    </p>
                  </div>
                  {topCut > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("nextPhase.topCutConfigured", { count: topCut })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <p className="text-sm font-semibold">{t("nextPhase.pairingsTitle")}</p>
              <p className="mb-3 mt-0.5 text-[13px] text-muted-foreground">
                {t("nextPhase.pairingsDescription")}
              </p>
              {seeds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("nextPhase.pairingsUnavailable")}</p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {seeds.map(({ high, low, index }) => (
                    <div key={high.playerId} className="overflow-hidden rounded-xl border">
                      <p className="border-b bg-muted/50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                        {t("nextPhase.matchN", { number: index + 1 })}
                      </p>
                      <p className="flex gap-2.5 border-b px-3 py-2 text-[13px]">
                        <span className="font-mono text-muted-foreground">{index + 1}</span>
                        <span className="truncate">{high.displayName}</span>
                      </p>
                      <p className="flex gap-2.5 px-3 py-2 text-[13px]">
                        <span className="font-mono text-muted-foreground">
                          {qualified.length - index}
                        </span>
                        <span className="truncate">{low?.displayName}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 rounded-xl border bg-muted/40 p-3 text-[13px] text-muted-foreground [text-wrap:pretty]">
                {t("nextPhase.launchNotice")}
              </p>
            </div>
          )}

          {error && open && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="justify-between sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 1 ? setOpen(false) : setStep((s) => (s - 1) as Step))}
              disabled={busy}
            >
              {step === 1 ? t("common.cancel") : t("nextPhase.back")}
            </Button>
            {step < 3 ? (
              <Button
                type="button"
                onClick={() => setStep((s) => (s + 1) as Step)}
                disabled={busy || (step === 1 && (currentIncomplete || !next))}
              >
                {step === 1 ? t("nextPhase.toTopCut") : t("nextPhase.toPairings")}
              </Button>
            ) : (
              <Button type="button" onClick={confirm} disabled={busy || !next || currentIncomplete}>
                {t("nextPhase.launch", { name: next?.name ?? "" })}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
