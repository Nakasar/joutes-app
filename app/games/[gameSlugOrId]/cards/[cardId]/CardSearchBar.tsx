"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { BoosterCard } from "@/lib/types/booster";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";

export default function CardSearchBar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("Games");

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
        `/api/games/riftbound/cards?searchQuery=${encodeURIComponent(
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
    router.push(`/games/riftbound/cards/${cardId}`);
    setSearchQuery("");
    setCards([]);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-2xl" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder={t("cards.search.placeholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
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
              <img
                src={card.image}
                alt={card.name}
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
