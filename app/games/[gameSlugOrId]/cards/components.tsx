"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { BoosterCard } from "@/lib/types/booster";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type CardWithType = BoosterCard & { type?: string };
type CardsApiResponse = {
  cards: CardWithType[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  setCodes: string[];
  types: string[];
};

const PAGE_SIZE = 24;

export function CardsComponent({ gameSlug }: { gameSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialSearchQuery = searchParams.get("searchQuery") ?? "";
  const initialPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedSetCode, setSelectedSetCode] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [cards, setCards] = useState<CardWithType[]>([]);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const hasInitializedRef = useRef(false);
  const pendingRequestKeyRef = useRef<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const t = useTranslations("Games");

  const fetchCards = useCallback(
    async (query: string, setCode: string, type: string, pageNumber: number) => {
      const trimmedQuery = query.trim();
      const normalizedSetCode = setCode && setCode !== "all" ? setCode : "all";
      const normalizedType = type && type !== "all" ? type : "all";
      const requestKey = `${trimmedQuery}|${normalizedSetCode}|${normalizedType}|${pageNumber}`;

      if (pendingRequestKeyRef.current === requestKey) {
        return;
      }

      activeControllerRef.current?.abort();
      const controller = new AbortController();
      activeControllerRef.current = controller;
      pendingRequestKeyRef.current = requestKey;
      setIsLoading(true);
      try {
        const params = new URLSearchParams();

        if (trimmedQuery) {
          params.set("searchQuery", trimmedQuery);
        }

        if (normalizedSetCode !== "all") {
          params.set("setCode", normalizedSetCode);
        }

        if (normalizedType !== "all") {
          params.set("type", normalizedType);
        }

        params.set("page", String(pageNumber));
        params.set("limit", String(PAGE_SIZE));

        const response = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as CardsApiResponse | CardWithType[];
        const nextCards = Array.isArray(data)
          ? data.filter((card): card is CardWithType => Boolean(card))
          : data.cards ?? [];
        const nextSetCodes = Array.isArray(data) ? [] : data.setCodes ?? [];
        const nextTypes = Array.isArray(data) ? [] : data.types ?? [];
        const nextPagination = Array.isArray(data)
          ? {
              page: 1,
              limit: PAGE_SIZE,
              total: nextCards.length,
              totalPages: Math.max(1, Math.ceil(nextCards.length / PAGE_SIZE)),
            }
          : {
              page: data.page ?? pageNumber,
              limit: data.limit ?? PAGE_SIZE,
              total: data.total ?? nextCards.length,
              totalPages: data.totalPages ?? Math.max(1, Math.ceil((data.total ?? nextCards.length) / PAGE_SIZE)),
            };

        if (controller.signal.aborted) {
          return;
        }

        setCards(nextCards);
        setSetCodes(nextSetCodes);
        setTypes(nextTypes);
        setPagination(nextPagination);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Erreur lors de la recherche:", error);
        setCards([]);
        setSetCodes([]);
        setTypes([]);
        setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
      } finally {
        if (activeControllerRef.current === controller) {
          activeControllerRef.current = null;
        }
        if (pendingRequestKeyRef.current === requestKey) {
          pendingRequestKeyRef.current = null;
        }
        setIsLoading(false);
      }
    },
    [gameSlug]
  );

  const updateURL = useCallback((query: string, setCode: string, type: string, page: number) => {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("searchQuery", query.trim());
    }

    if (setCode && setCode !== "all") {
      params.set("setCode", setCode);
    }

    if (type && type !== "all") {
      params.set("type", type);
    }

    if (page > 1) {
      params.set("page", String(page));
    }

    const nextSearch = params.toString();
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, { scroll: false });
  }, [pathname, router]);

  // Initial load from URL parameters
  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    const urlQuery = searchParams.get("searchQuery") ?? "";
    const urlPage = Number.parseInt(searchParams.get("page") ?? "1", 10) || 1;
    const urlSetCode = searchParams.get("setCode") ?? "all";
    const urlType = searchParams.get("type") ?? "all";

    setSearchQuery(urlQuery);
    setCurrentPage(urlPage);
    setSelectedSetCode(urlSetCode);
    setSelectedType(urlType);

    void fetchCards(urlQuery, urlSetCode, urlType, urlPage);
  }, [fetchCards, searchParams]);

  // Debounced search when typing
  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length === 0 || trimmedQuery.length > 2) {
      const timer = window.setTimeout(() => {
        void fetchCards(trimmedQuery, selectedSetCode, selectedType, 1);
        setCurrentPage(1);
        updateURL(trimmedQuery, selectedSetCode, selectedType, 1);
      }, trimmedQuery.length === 0 ? 0 : 300);

      return () => window.clearTimeout(timer);
    }

    setCards([]);
    setSetCodes([]);
    setTypes([]);
    setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    return undefined;
  }, [searchQuery, selectedSetCode, selectedType, fetchCards, updateURL]);

  const handleSearch = () => {
    const newPage = 1;
    setCurrentPage(newPage);
    void fetchCards(searchQuery, selectedSetCode, selectedType, newPage);
    updateURL(searchQuery, selectedSetCode, selectedType, newPage);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > pagination.totalPages || isLoading) {
      return;
    }

    setCurrentPage(nextPage);
    void fetchCards(searchQuery, selectedSetCode, selectedType, nextPage);
    updateURL(searchQuery, selectedSetCode, selectedType, nextPage);
  };

  const handleSetCodeChange = (value: string) => {
    const newPage = 1;
    setSelectedSetCode(value);
    setCurrentPage(newPage);
    void fetchCards(searchQuery, value, selectedType, newPage);
    updateURL(searchQuery, value, selectedType, newPage);
  };

  const handleTypeChange = (value: string) => {
    const newPage = 1;
    setSelectedType(value);
    setCurrentPage(newPage);
    void fetchCards(searchQuery, selectedSetCode, value, newPage);
    updateURL(searchQuery, selectedSetCode, value, newPage);
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
            onChange={(e) => {
              setSearchQuery(e.target.value);
            }}
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
            <Select value={selectedSetCode} onValueChange={handleSetCodeChange}>
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
            <Select value={selectedType} onValueChange={handleTypeChange}>
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
        {cards.map((card) => (
          <Link
            key={`${card.cardId}-${card.setCode}-${card.collectorNumber}`}
            href={`/games/${gameSlug}/cards/${card.id}`}
            className="cursor-pointer border rounded-lg p-4 hover:shadow-lg transition-shadow"
          >
            <Image src={card.image} alt={card.name} width={600} height={400} unoptimized className="w-full rounded-md mb-2" />
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

      {pagination.totalPages > 1 ? (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {t("cards.search.pagination.results", {
              start: pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1,
              end: Math.min(pagination.page * pagination.limit, pagination.total),
              total: pagination.total,
            })}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1 || isLoading}
            >
              {t("cards.search.pagination.previous")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t("cards.search.pagination.page", {
                currentPage,
                totalPages: pagination.totalPages,
              })}
            </span>
            <Button
              variant="outline"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === pagination.totalPages || isLoading}
            >
              {t("cards.search.pagination.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
