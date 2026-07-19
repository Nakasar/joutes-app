"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BoosterCard } from "@/lib/types/booster";
import { Search, X, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export type SelectedLegend = { id: string; name: string; image: string };

export default function LegendPicker({
  value,
  onChange,
}: {
  value: SelectedLegend | null;
  onChange: (legend: SelectedLegend | null) => void;
}) {
  const t = useTranslations("Games.Tracker");
  const [searchQuery, setSearchQuery] = useState("");
  const [cards, setCards] = useState<BoosterCard[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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
    if (searchQuery.trim().length <= 1) {
      setCards([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(() => {
      void handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const handleSearch = async (query: string) => {
    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/games/riftbound/cards?searchQuery=${encodeURIComponent(query)}&type=Legend&setCode=*&lang=all`
      );
      const data: BoosterCard[] = await res.json();
      setCards(data.slice(0, 10));
      setIsOpen(true);
    } catch (error) {
      console.error("Legend search error", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelect = (card: BoosterCard) => {
    onChange({ id: card.id, name: card.name, image: card.image });
    setSearchQuery("");
    setCards([]);
    setIsOpen(false);
  };

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-lg border p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value.image} alt={value.name} className="h-12 w-auto rounded" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{value.name}</span>
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(null)} aria-label={t("clearLegend")}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative" ref={searchRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("legendSearchPlaceholder")}
          className="pl-9"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {isOpen && cards.length > 0 && (
        <div className="absolute top-full z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border bg-card shadow-lg">
          {cards.map((card) => (
            <button
              key={`${card.id}-${card.setCode}-${card.collectorNumber}`}
              type="button"
              onClick={() => handleSelect(card)}
              className="flex w-full items-center gap-3 border-b p-2 text-left transition-colors last:border-b-0 hover:bg-muted"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.image} alt={card.name} className="h-12 w-auto rounded" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{card.name}</div>
                <div className="text-xs text-muted-foreground">
                  {card.setCode} #{card.collectorNumber}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {isOpen && !isSearching && cards.length === 0 && searchQuery.trim().length > 1 && (
        <div className="absolute top-full z-50 mt-1 w-full rounded-lg border bg-card p-3 shadow-lg">
          <p className="text-sm text-muted-foreground">{t("legendEmpty")}</p>
        </div>
      )}
    </div>
  );
}
