"use client";

import { useState, useTransition } from "react";
import { ChartLine, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/confirm-dialog.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { tournamentPath } from "@/lib/meta/tournaments.ts";
import { MetaDeckEditDialog } from "@/components/decks/MetaDeckEditDialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { markDeckAsMetaAction, removeMetaDeckAction } from "@/app/[locale]/(app)/decks/meta/manage/actions.ts";

export type MetaDeckBannerMeta = {
  imported: boolean;
  source: string;
  eventDate: string;
  placement?: string;
  pilot?: string;
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/**
 * Le bandeau « Méta » d'une fiche de deck.
 *
 * Tout le monde voit d'où vient un deck méta (le tournoi, le classement).
 * Qui gère la méta peut en plus faire compter le deck public d'un joueur, ou
 * l'en retirer ; un deck importé se supprime depuis la gestion de la méta.
 */
export function MetaDeckBanner({
  deckId,
  deckName,
  gameId,
  meta,
  canManage,
  isPublic,
}: {
  deckId: string;
  deckName: string;
  gameId: string;
  meta?: MetaDeckBannerMeta;
  canManage: boolean;
  isPublic: boolean;
}) {
  const router = useRouter();
  const manageHref = `/decks/meta/manage?game=${encodeURIComponent(gameId)}&tab=decks`;
  const [marking, setMarking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState("");
  const [eventDate, setEventDate] = useState(today);
  const [placement, setPlacement] = useState("");
  const [busy, startTransition] = useTransition();

  if (!meta && !(canManage && isPublic)) return null;

  const mark = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await markDeckAsMetaAction({ deckId, source, eventDate, placement: placement || undefined });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Le deck compte maintenant dans la méta.");
      setMarking(false);
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await removeMetaDeckAction(deckId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRemoving(false);
      if (result.deleted) {
        toast.success("Deck supprimé.");
        router.push(manageHref);
      } else {
        toast.success("Le deck ne compte plus dans la méta.");
        router.refresh();
      }
    });

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
      <ChartLine className="size-4 shrink-0 text-primary" aria-hidden />
      {meta ? (
        <span className="min-w-48 flex-1">
          <span className="font-semibold">Méta</span> ·{" "}
          <Link href={tournamentPath(`/games/${gameId}/meta`, meta.source, meta.eventDate)} className="underline-offset-2 hover:underline">
            {meta.source}
          </Link>
          {meta.placement && ` · ${meta.placement}`}
          <span className="text-muted-foreground"> · {dateFormat.format(new Date(meta.eventDate))}</span>
        </span>
      ) : (
        <span className="min-w-48 flex-1 text-muted-foreground">Ce deck ne compte pas dans les statistiques de la méta.</span>
      )}

      {canManage && meta && (
        <div className="flex flex-wrap gap-2">
          {meta.imported && (
            <Button asChild variant="ghost" size="sm">
              <Link href={manageHref}>Gérer la méta</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Modifier
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRemoving(true)}>
            {meta.imported ? "Supprimer" : "Retirer de la méta"}
          </Button>
        </div>
      )}
      {canManage && !meta && (
        <Button variant="outline" size="sm" onClick={() => setMarking(true)}>
          Compter dans la méta
        </Button>
      )}

      <Dialog open={marking} onOpenChange={setMarking}>
        <DialogContent>
          <form onSubmit={mark} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Compter ce deck dans la méta</DialogTitle>
              <DialogDescription>
                Le deck reste celui de son joueur et garde son auteur ; il entre dans les statistiques de la page Méta.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="meta-mark-source">Source</Label>
              <Input
                id="meta-mark-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Regional Lyon"
                maxLength={80}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meta-mark-date">Date du tournoi</Label>
                <Input id="meta-mark-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="meta-mark-placement">Classement</Label>
                <Input
                  id="meta-mark-placement"
                  value={placement}
                  onChange={(event) => setPlacement(event.target.value)}
                  placeholder="1, 3-4, Top 8"
                  maxLength={40}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMarking(false)} disabled={busy}>
                Annuler
              </Button>
              <Button type="submit" disabled={busy || !source.trim()}>
                {busy && <Loader2 className="animate-spin" aria-hidden />}
                Compter dans la méta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {canManage && meta && (
        <MetaDeckEditDialog deck={editing ? { id: deckId, name: deckName, meta } : null} onClose={() => setEditing(false)} />
      )}

      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={meta?.imported ? "Supprimer ce deck importé ?" : "Retirer ce deck de la méta ?"}
        description={
          meta?.imported
            ? "Le deck a été importé pour la méta : il sera supprimé et sortira des statistiques."
            : "Le deck reste celui de son joueur, mais ne compte plus dans les statistiques."
        }
        confirmLabel={meta?.imported ? "Supprimer" : "Retirer"}
        destructive
        busy={busy}
        onConfirm={remove}
      />
    </div>
  );
}
