"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { DateTime } from "luxon";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { updateMetaDeckAction } from "@/app/[locale]/(app)/decks/meta/manage/actions.ts";

export type EditableMetaDeck = {
  id: string;
  name: string;
  meta: { imported: boolean; source: string; eventDate: string; placement?: string; pilot?: string };
};

/** La date du tournoi telle que la saisit un champ date : le jour enregistré, sans décalage de fuseau. */
function toDateInput(iso: string): string {
  return DateTime.fromISO(iso, { zone: "utc" }).toISODate() ?? "";
}

/**
 * Corrige la provenance d'un deck méta. Le nom et le joueur ne se modifient
 * que pour un deck importé : un deck marqué reste celui de son joueur.
 */
export function MetaDeckEditDialog({ deck, onClose }: { deck: EditableMetaDeck | null; onClose: () => void }) {
  return (
    <Dialog open={deck !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{deck && <EditForm key={deck.id} deck={deck} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditForm({ deck, onClose }: { deck: EditableMetaDeck; onClose: () => void }) {
  const router = useRouter();
  const { imported } = deck.meta;
  const [name, setName] = useState(deck.name);
  const [source, setSource] = useState(deck.meta.source);
  const [eventDate, setEventDate] = useState(() => toDateInput(deck.meta.eventDate));
  const [placement, setPlacement] = useState(deck.meta.placement ?? "");
  const [pilot, setPilot] = useState(deck.meta.pilot ?? "");
  const [busy, startTransition] = useTransition();

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateMetaDeckAction({
        deckId: deck.id,
        source,
        eventDate,
        placement,
        ...(imported ? { name, pilot } : {}),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Deck méta modifié.");
      onClose();
      router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Modifier le deck méta</DialogTitle>
        <DialogDescription>
          {imported
            ? "Les statistiques de la méta se mettent à jour dès l'enregistrement."
            : "Ce deck est celui d'un joueur : son nom et son auteur restent les siens. Seule sa provenance se modifie ici."}
        </DialogDescription>
      </DialogHeader>
      {imported && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-edit-name">Nom du deck</Label>
          <Input id="meta-edit-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-edit-source">Tournoi</Label>
        <Input
          id="meta-edit-source"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Regional Lyon"
          maxLength={80}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-edit-date">Date du tournoi</Label>
          <Input id="meta-edit-date" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-edit-placement">Classement</Label>
          <Input
            id="meta-edit-placement"
            value={placement}
            onChange={(event) => setPlacement(event.target.value)}
            placeholder="1, 3-4, Top 8"
            maxLength={40}
          />
        </div>
      </div>
      {imported && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="meta-edit-pilot">Joueur</Label>
          <Input
            id="meta-edit-pilot"
            value={pilot}
            onChange={(event) => setPilot(event.target.value)}
            placeholder="Méta Joutes si vide"
            maxLength={80}
          />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Annuler
        </Button>
        <Button type="submit" disabled={busy || !source.trim() || !eventDate || (imported && !name.trim())}>
          {busy && <Loader2 className="animate-spin" aria-hidden />}
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}
