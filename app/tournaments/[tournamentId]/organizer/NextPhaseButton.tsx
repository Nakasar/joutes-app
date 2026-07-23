"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
  nextPhase: { id: string; name: string; type: string; topCut?: number } | null;
  qualification: { qualified: Entry[]; eliminated: Entry[]; topCut?: number } | null;
};

export function NextPhaseButton({ tournamentId }: { tournamentId: string }) {
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
        throw new Error(body.error ?? "Erreur lors du chargement");
      }
      const data: Transition = await res.json();
      if (!data.nextPhase) {
        setError("Aucune phase suivante à démarrer.");
        return;
      }
      setTransition(data);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du chargement");
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
        throw new Error(body.error ?? "Erreur lors du passage à la phase suivante");
      }
      const round = await res.json();
      // Redirige vers la saisie des résultats de la première ronde créée.
      router.push(`/tournaments/${tournamentId}/organizer/rounds/${round.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors du passage à la phase suivante");
      setBusy(false);
    }
  };

  const next = transition?.nextPhase;
  const qualified = transition?.qualification?.qualified ?? [];
  const eliminated = transition?.qualification?.eliminated ?? [];
  const hasCut = (transition?.qualification?.topCut ?? 0) > 0 && eliminated.length > 0;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={openDialog} disabled={loading} variant="outline">
        <ArrowRight className="mr-2 h-4 w-4" />
        Passer à la phase suivante
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
            <DialogTitle>Passer à la phase suivante</DialogTitle>
            <DialogDescription>
              {transition?.currentPhase
                ? `La phase « ${transition.currentPhase.name} » sera clôturée. `
                : ""}
              {next
                ? `La phase « ${next.name} » va démarrer et sa première ronde sera créée.`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {hasCut && (
            <div className="space-y-2">
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                Attention : {eliminated.length} joueur(s) non qualifiés seront éliminés (statut
                DROPPED) par le top cut ({transition?.qualification?.topCut}).
              </div>
              <div>
                <p className="mb-1 text-sm font-medium">Joueurs qualifiés ({qualified.length}) :</p>
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
              Annuler
            </Button>
            <Button type="button" onClick={confirm} disabled={busy || !next}>
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
