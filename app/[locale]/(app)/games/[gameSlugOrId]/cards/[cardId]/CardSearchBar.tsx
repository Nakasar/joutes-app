"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { CardSearchInput } from "@/components/cards/CardSearchInput.tsx";
import { useCardSearchFields } from "@/lib/cards/use-card-search-fields.ts";
import { BoosterCard } from "@/lib/types/booster.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useLocale, useTranslations } from "next-intl";
import CardImage from "@/components/cards/CardImage.tsx";

export default function CardSearchBar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Games");
  // Le jeu de la fiche ouverte : la recherche ne vise plus Riftbound d'office.
  const { gameSlugOrId } = useParams<{ gameSlugOrId: string }>();
  const game = gameSlugOrId ?? "riftbound";
  const searchFields = useCardSearchFields(game);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (searchQuery.length > 2) {
      const timer = setTimeout(() => {
        handleSearch();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setCards([]);
      setIsOpen(false);
    }
  }, [searchQuery]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      const response = await fetch(
        `/api/games/${encodeURIComponent(game)}/cards?searchQuery=${encodeURIComponent(
          searchQuery
        )}&setCode=*&lang=${locale}`
      );
      const data = await response.json();
      setCards(data.slice(0, 10));
      setIsOpen(data.length > 0);
    } catch (error) {
      console.error("Erreur lors de la recherche:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleCardSelect = (cardId: string) => {
    router.push(`/games/${game}/cards/${cardId}`);
    setSearchQuery("");
    setCards([]);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-2xl" ref={searchRef}>
      <div className="relative">
        {/* La barre commune : mêmes tokens que la galerie (`set:OGN jinx`). */}
        <CardSearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          fields={searchFields}
          placeholder={t("cards.search.placeholder")}
          openOnFocus={false}
          className="h-10 w-full pl-9"
        />
      </div>

      {isOpen && cards.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-card border rounded-lg shadow-lg z-50 max-h-[400px] overflow-y-auto">
          {cards.map((card) => (
            <button
              key={`${card.id}-${card.setCode}-${card.collectorNumber}`}
              onClick={() => card.id && handleCardSelect(card.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-muted transition-colors text-left border-b last:border-b-0"
            >
              <CardImage
                src={card.image}
                alt={card.name}
                orientation={card.orientation}
                loading="lazy"
                className="w-16 h-auto rounded"
              />
              <div className="flex-1">
                <div className="font-medium">{card.name}</div>
                {card.subtitle && <div className="font-light">{card.subtitle}</div>}
                <div className="text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isSearching && (
        <div className="absolute top-full mt-2 w-full bg-card border rounded-lg shadow-lg z-50 p-3">
          <p className="text-sm text-muted-foreground">{t("cards.search.searching")}</p>
        </div>
      )}
    </div>
  );
}
