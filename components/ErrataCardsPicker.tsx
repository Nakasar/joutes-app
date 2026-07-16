"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { BoosterCard } from "@/lib/types/booster";
import { X } from "lucide-react";

export default function ErrataCardsPicker({
  gameSlugOrId,
  selectedCards,
  onChange,
  lockedCardIds = [],
  searchPlaceholder = "Rechercher une carte...",
  emptyMessage = "Aucune carte trouvée.",
  searchingLabel = "Recherche...",
}: {
  gameSlugOrId: string;
  selectedCards: BoosterCard[];
  onChange: (cards: BoosterCard[]) => void;
  lockedCardIds?: string[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchingLabel?: string;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (searchQuery.trim().length <= 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(
          `/api/games/${gameSlugOrId}/cards?searchQuery=${encodeURIComponent(searchQuery)}&setCode=*&lang=all`
        );
        const data: BoosterCard[] = await response.json();
        setResults(data.slice(0, 10));
      } catch (error) {
        console.error("Erreur lors de la recherche de cartes:", error);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, gameSlugOrId]);

  const addCard = (card: BoosterCard) => {
    if (selectedCards.some((c) => c.id === card.id)) return;
    onChange([...selectedCards, card]);
    setSearchQuery("");
    setResults([]);
  };

  const removeCard = (cardId: string) => {
    if (lockedCardIds.includes(cardId)) return;
    onChange(selectedCards.filter((c) => c.id !== cardId));
  };

  const selectableResults = results.filter(
    (card) => !selectedCards.some((c) => c.id === card.id)
  );

  return (
    <div className="grid gap-2">
      {selectedCards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCards.map((card) => (
            <span
              key={card.id}
              className="flex items-center gap-1 rounded-md border bg-muted px-2 py-1 text-sm"
            >
              {card.name}
              {!lockedCardIds.includes(card.id) && (
                <button
                  type="button"
                  onClick={() => removeCard(card.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      <Input
        type="text"
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      {isSearching && (
        <p className="text-sm text-muted-foreground">{searchingLabel}</p>
      )}
      {!isSearching && searchQuery.trim().length > 2 && selectableResults.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}
      {selectableResults.length > 0 && (
        <div className="max-h-[200px] overflow-y-auto rounded-md border">
          {selectableResults.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => addCard(card)}
              className="flex w-full items-center gap-2 p-2 text-left transition-colors hover:bg-muted"
            >
              <img src={card.image} alt={card.name} className="h-12 w-auto rounded" />
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
    </div>
  );
}
