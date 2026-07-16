"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateErrata } from "@/app/games/[gameSlugOrId]/actions";
import { Errata, ErrataType } from "@/lib/types/errata";
import { BoosterCard } from "@/lib/types/booster";
import { Pencil, X } from "lucide-react";
import ErrataCardsPicker from "@/components/ErrataCardsPicker";

export default function EditErrataDialog({
  errata,
  cardId,
  gameSlugOrId,
}: {
  errata: Errata;
  cardId?: string;
  gameSlugOrId: string;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ErrataType>(errata.type);
  const [details, setDetails] = useState(errata.details);
  const [source, setSource] = useState(errata.source || "");
  const [errataDate, setErrataDate] = useState(
    errata.errataDate ? new Date(errata.errataDate).toISOString().split("T")[0] : ""
  );
  const [deprecatedAt, setDeprecatedAt] = useState(
    errata.deprecatedAt ? new Date(errata.deprecatedAt).toISOString().split("T")[0] : ""
  );
  const [selectedCards, setSelectedCards] = useState<BoosterCard[]>(errata.cards ?? []);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (selectedCards.length === 0) {
      alert("Un errata doit être lié à au moins une carte.");
      return;
    }

    setIsSubmitting(true);

    try {
      const newCardIds = selectedCards.map((c) => c.id);

      await updateErrata(
        errata.id,
        {
          type,
          details,
          source: source.trim() || undefined,
          errataDate: new Date(errataDate),
          deprecatedAt: deprecatedAt ? new Date(deprecatedAt) : null,
          cardIds: newCardIds,
        },
        Array.from(new Set([...errata.cardIds, ...newCardIds, ...(cardId ? [cardId] : [])]))
      );

      setOpen(false);
    } catch (error) {
      console.error("Erreur lors de la modification de l'errata:", error);
      alert("Erreur lors de la modification de l'errata");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Modifier l'errata</DialogTitle>
            <DialogDescription>
              Modifiez les informations de l'errata, clarification ou ruling.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                Cartes liées
              </label>
              <ErrataCardsPicker
                gameSlugOrId={gameSlugOrId}
                selectedCards={selectedCards}
                onChange={setSelectedCards}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="type" className="text-sm font-medium">
                Type
              </label>
              <Select value={type} onValueChange={(v) => setType(v as ErrataType)}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="errata">Errata</SelectItem>
                  <SelectItem value="clarification">Clarification</SelectItem>
                  <SelectItem value="ruling">Ruling</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label htmlFor="errataDate" className="text-sm font-medium">
                Date de l'errata
              </label>
              <Input
                id="errataDate"
                type="date"
                value={errataDate}
                onChange={(e) => setErrataDate(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="details" className="text-sm font-medium">
                Détails (Markdown)
              </label>
              <textarea
                id="details"
                className="min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">
                Source (URL optionnelle)
              </label>
              <Input
                id="source"
                type="url"
                placeholder="https://..."
                value={source}
                onChange={(e) => setSource(e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="deprecatedAt" className="text-sm font-medium">
                Date de dépréciation (optionnelle)
              </label>
              <div className="flex gap-2">
                <Input
                  id="deprecatedAt"
                  type="date"
                  value={deprecatedAt}
                  onChange={(e) => setDeprecatedAt(e.target.value)}
                  className="flex-1"
                />
                {deprecatedAt && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setDeprecatedAt("")}
                    title="Supprimer la dépréciation"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isSubmitting}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Modification..." : "Modifier"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
