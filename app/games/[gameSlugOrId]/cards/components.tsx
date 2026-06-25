"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { BoosterCard } from "@/lib/types/booster";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CardsComponent({ gameSlug }: { gameSlug: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<BoosterCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/games/${gameSlug}/cards?searchQuery=${encodeURIComponent(
          searchQuery
        )}`
      );
      const data = await response.json();
      setCards(data);
    } catch (error) {
      console.error("Erreur lors de la recherche:", error);
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Recherche de cartes</h1>
      <Button asChild>
        <Link href={`/games/${gameSlug}`} className="text-blue-600 hover:underline">
          ← Retour au portail du jeu
        </Link>
      </Button>

      <div className="mb-6 flex gap-2">
        <Input
          type="text"
          placeholder="Rechercher une carte par nom..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
          className="flex-1"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? "Recherche..." : "Rechercher"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Link
            key={`${card.cardId}-${card.setCode}-${card.collectorNumber}`}
            href={`/games/${gameSlug}/cards/${card.id}`}
            className="cursor-pointer border rounded-lg p-4 hover:shadow-lg transition-shadow"
          >
            <img
              src={card.image}
              alt={card.name}
              className="w-full rounded-md mb-2"
            />
            <h3 className="font-semibold">{card.name}</h3>
            <p className="text-sm text-muted-foreground">
              {card.setCode} #{card.collectorNumber}
            </p>
          </Link>
        ))}
      </div>

      {!isLoading && cards.length === 0 && searchQuery && (
        <p className="text-center text-muted-foreground mt-8">
          Aucune carte trouvée pour "{searchQuery}"
        </p>
      )}
    </div>
  );
}
