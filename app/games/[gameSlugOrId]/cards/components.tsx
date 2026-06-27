"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { BoosterCard } from "@/lib/types/booster";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";

type CardWithType = BoosterCard & { type?: string };

const PAGE_SIZE = 24;

export function CardsComponent({ gameSlug }: { gameSlug: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSetCode, setSelectedSetCode] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [cards, setCards] = useState<CardWithType[]>([]);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const t = useTranslations("Games");

  const fetchCards = useCallback(
    async (query: string, setCode: string, type: string) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        const trimmedQuery = query.trim();

        if (trimmedQuery) {
          params.set("searchQuery", trimmedQuery);
        }

        if (setCode && setCode !== "all") {
          params.set("setCode", setCode);
        }

        if (type && type !== "all") {
          params.set("type", type);
        }

        const response = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`);
        const data = await response.json();
        const nextCards = Array.isArray(data)
          ? (data as CardWithType[]).filter((card): card is CardWithType => Boolean(card))
          : [];

        setCards(nextCards);
        setSetCodes(
          Array.from(new Set(nextCards.map((card) => card.setCode).filter(Boolean))).sort()
        );
        setTypes(
          Array.from(
            new Set(
              nextCards
                .map((card) => card.type)
                .filter((cardType): cardType is string => Boolean(cardType))
            )
          ).sort()
        );
      } catch (error) {
        console.error("Erreur lors de la recherche:", error);
        setCards([]);
        setSetCodes([]);
        setTypes([]);
      } finally {
        setIsLoading(false);
      }
    },
    [gameSlug]
  );

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length === 0 || trimmedQuery.length > 2) {
      const timer = window.setTimeout(() => {
        setCurrentPage(1);
        void fetchCards(trimmedQuery, selectedSetCode, selectedType);
      }, trimmedQuery.length === 0 ? 0 : 300);

      return () => window.clearTimeout(timer);
    }

    setCards([]);
    setSetCodes([]);
    setTypes([]);
    setCurrentPage(1);
    return undefined;
  }, [fetchCards, searchQuery, selectedSetCode, selectedType]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [cards.length, currentPage]);

  const totalPages = Math.max(1, Math.ceil(cards.length / PAGE_SIZE));
  const paginatedCards = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return cards.slice(start, start + PAGE_SIZE);
  }, [cards, currentPage]);

  const handleSearch = () => {
    setCurrentPage(1);
    void fetchCards(searchQuery, selectedSetCode, selectedType);
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{t("cards.search.title")}</h1>
      <Button asChild>
        <Link href={`/games/${gameSlug}`} className="text-blue-600 hover:underline">
          ← {t("cards.back")}
        </Link>
      </Button>

      <div className="mb-6 mt-6 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Input
            type="text"
            placeholder={t("cards.search.placeholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch();
              }
            }}
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="w-full sm:w-44">
            <label className="mb-1 block text-sm font-medium">
              {t("cards.search.filters.setCode")}
            </label>
            <Select value={selectedSetCode} onValueChange={setSelectedSetCode}>
              <SelectTrigger>
                <SelectValue placeholder={t("cards.search.filters.allSets")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("cards.search.filters.allSets")}</SelectItem>
                {setCodes.map((setCode) => (
                  <SelectItem key={setCode} value={setCode}>
                    {setCode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-44">
            <label className="mb-1 block text-sm font-medium">
              {t("cards.search.filters.type")}
            </label>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder={t("cards.search.filters.allTypes")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("cards.search.filters.allTypes")}</SelectItem>
                {types.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSearch} disabled={isLoading} className="h-10">
            {isLoading ? t("cards.search.searching") : t("cards.search.search")}
          </Button>
        </div>
      </div>

      {isLoading && cards.length === 0 ? (
        <p className="text-center text-muted-foreground mt-8">
          {t("cards.search.searching")}
        </p>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {paginatedCards.map((card) => (
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
            {card.type ? (
              <p className="text-xs text-muted-foreground mt-1">{card.type}</p>
            ) : null}
          </Link>
        ))}
      </div>

      {!isLoading && cards.length === 0 ? (
        <p className="text-center text-muted-foreground mt-8">
          {searchQuery.trim()
            ? t("cards.search.noResults", { query: searchQuery })
            : t("cards.search.emptyState")}
        </p>
      ) : null}

      {cards.length > PAGE_SIZE ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("cards.search.pagination.results", {
              start: (currentPage - 1) * PAGE_SIZE + 1,
              end: Math.min(currentPage * PAGE_SIZE, cards.length),
              total: cards.length,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              disabled={currentPage === 1 || isLoading}
            >
              {t("cards.search.pagination.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("cards.search.pagination.page", {
                currentPage,
                totalPages,
              })}
            </span>
            <Button
              variant="outline"
              onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              disabled={currentPage === totalPages || isLoading}
            >
              {t("cards.search.pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
