"use client";

import { useState, useEffect } from "react";
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
import { createErrata } from "@/app/games/[gameSlugOrId]/actions";
import { ErrataType } from "@/lib/types/errata";
import { BoosterCard } from "@/lib/types/booster";

export default function AddErrataDialog() {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<BoosterCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<BoosterCard | null>(null);
  const [type, setType] = useState<ErrataType>("errata");
  const [details, setDetails] = useState("");
  const [source, setSource] = useState("");
  const [errataDate, setErrataDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const timer = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setCards([]);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/games/riftbound/cards?searchQuery=${encodeURIComponent(
          searchQuery
        )}&setCode=*&lang=fr`
      );
      const data = await response.json();
      setCards(data.slice(0, 10)); // Limiter à 10 résultats
    } catch (error) {
      console.error("Erreur lors de la recherche:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCard?.id) {
      alert("Veuillez sélectionner une carte");
      return;
    }

    setIsSubmitting(true);

    try {
      await createErrata({
        cardIds: [selectedCard.id],
        type,
        details,
        originalLang: "fr",
        source: source.trim() || undefined,
        errataDate: new Date(errataDate),
      });

      setOpen(false);
      setSearchQuery("");
      setCards([]);
      setSelectedCard(null);
      setType("errata");
      setDetails("");
      setSource("");
      setErrataDate(new Date().toISOString().split("T")[0]);
    } catch (error) {
      console.error("Erreur lors de la création de l'errata:", error);
      alert("Erreur lors de la création de l'errata");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Ajouter un errata</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[625px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ajouter un errata</DialogTitle>
            <DialogDescription>
              Recherchez une carte et ajoutez un errata, une clarification ou
              un ruling.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="search" className="text-sm font-medium">
                Carte
              </label>
              <Input
                id="search"
                type="text"
                placeholder="Rechercher une carte..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={!!selectedCard}
              />
              {selectedCard && (
                <div className="flex items-center gap-2 p-2 border rounded-md bg-muted">
                  <img
                    src={selectedCard.image}
                    alt={selectedCard.name}
                    className="w-12 h-auto rounded"
                  />
                  <span className="flex-1">{selectedCard.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCard(null);
                      setSearchQuery("");
                    }}
                  >
                    Changer
                  </Button>
                </div>
              )}
              {!selectedCard && cards.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto border rounded-md">
                  {cards.map((card) => (
                    <button
                      key={`${card.cardId}-${card.setCode}-${card.collectorNumber}`}
                      type="button"
                      onClick={() => {
                        setSelectedCard(card);
                        setCards([]);
                      }}
                      className="w-full flex items-center gap-2 p-2 hover:bg-muted transition-colors text-left"
                    >
                      <img
                        src={card.image}
                        alt={card.name}
                        className="w-12 h-auto rounded"
                      />
                      <div>
                        <div className="font-medium">{card.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {card.setCode} #{card.collectorNumber}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {isSearching && (
                <p className="text-sm text-muted-foreground">Recherche...</p>
              )}
            </div>
            <div className="grid gap-2">
              <label htmlFor="type" className="text-sm font-medium">
                Type
              </label>
              <Select
                value={type}
                onValueChange={(value) => setType(value as ErrataType)}
              >
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
                Date de l&apos;errata
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
                Détails
              </label>
              <textarea
                id="details"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
                className="min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Décrivez l'errata, la clarification ou le ruling... (Markdown supporté)"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="source" className="text-sm font-medium">
                Source (optionnel)
              </label>
              <Input
                id="source"
                type="url"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="https://example.com/errata"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || !selectedCard}>
              {isSubmitting ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
