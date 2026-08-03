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
import { useSession } from "@/lib/auth-client";
import AddToWishlistButton from "@/components/AddToWishlistButton";
import { Check, LayoutGrid, Link2, List, Minus, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import type { CardPrinting } from "@/lib/types/card";
import {
  EMPTY_CRITERIA,
  countActiveFacetFilters,
  parseCardSearchCriteria,
  serializeCardSearchCriteria,
  sortableKeys,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";
import {
  applyTokenSuggestion,
  buildSearchFields,
  currentWord,
  parseSearchSyntax,
  removeSearchWord,
  suggestTokens,
} from "@/lib/cards/search-syntax";

// La recherche renvoie le document de catalogue : il porte aussi les variantes
// d'impression de la carte, absentes d'un simple exemplaire de collection.
type CardWithType = BoosterCard & { type?: string; printings?: CardPrinting[] };
type CardsApiResponse = {
  cards: CardWithType[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  setCodes: string[];
  types: string[];
  languages: string[];
  facets?: CardFilterFacet[];
  /** L'index n'accepte pas encore les filtres d'attributs : les résultats les ignorent. */
  filtersUnavailable?: boolean;
};

const PAGE_SIZE = 24;

/**
 * Largeur minimale d'une tuile, du plus dense au plus large. Parcourir un
 * catalogue et détailler une illustration ne demandent pas la même taille : le
 * réglage reste à portée de main au-dessus des résultats.
 */
const TILE_WIDTHS = [120, 152, 190, 240];
const DEFAULT_DENSITY = 2;

/** Une section de la barre latérale : un intitulé discret, puis ses contrôles. */
function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

/** Valeur d'attribut à cocher. Un bouton plutôt qu'une case : plus compact, et la liste en compte souvent une dizaine. */
function FacetChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "bg-background hover:bg-muted"
      }`}
    >
      {active ? <Check className="h-3 w-3" /> : null}
      {children}
    </button>
  );
}

export function CardsComponent({ gameSlug }: { gameSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const initialSearchQuery = searchParams.get("searchQuery") ?? "";
  const initialPage = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedSetCode, setSelectedSetCode] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  // Les facettes arrivent avec la première réponse : elles décrivent les
  // attributs du jeu et bornent ce que les critères peuvent demander.
  const [facets, setFacets] = useState<CardFilterFacet[]>([]);
  const [criteria, setCriteria] = useState<CardSearchCriteria>(EMPTY_CRITERIA);
  // La barre latérale est toujours là sur bureau ; sur mobile elle se déplie.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersUnavailable, setFiltersUnavailable] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [density, setDensity] = useState(DEFAULT_DENSITY);
  const [linkCopied, setLinkCopied] = useState(false);
  // Suggestions de la barre de recherche : ouvertes à la frappe, parcourues au
  // clavier. `-1` = aucune sélectionnée, Entrée lance alors la recherche.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const copiedTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
    },
    []
  );
  // Critères lus de l'URL avant de connaître les facettes : ils sont transmis
  // tels quels à la première requête, puis relus dès que les facettes arrivent,
  // pour qu'un lien partagé s'ouvre bien sur ses filtres.
  const pendingCriteriaRef = useRef<URLSearchParams | null>(null);
  const [cards, setCards] = useState<CardWithType[]>([]);
  const [setCodes, setSetCodes] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
  });
  const hasInitializedRef = useRef(false);
  // Dernière saisie effectivement cherchée. Seule la saisie est « débouncée » :
  // tous les autres contrôles lancent eux-mêmes leur recherche, et sans cette
  // mémoire leur changement d'état reprogrammerait 300 ms plus tard un second
  // appel — et un second `router.replace` — pour la requête qui vient de partir.
  const lastSearchedQueryRef = useRef<string | null>(null);
  const pendingRequestKeyRef = useRef<string | null>(null);
  const activeControllerRef = useRef<AbortController | null>(null);
  const t = useTranslations("Games");

  // Ids des cartes déjà présentes dans une wishlist de l'utilisateur (cœur
  // rouge sur les tuiles). Chargés une fois par session/jeu.
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!session) {
      // Déconnexion / session expirée : plus aucun cœur rouge.
      setWishlistedIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/wishlists/mine/card-ids?gameSlug=${encodeURIComponent(gameSlug)}`);
        if (!res.ok) return;
        const data: { cardIds?: string[] } = await res.json();
        if (!cancelled && Array.isArray(data.cardIds)) {
          setWishlistedIds(new Set(data.cardIds));
        }
      } catch {
        // Best-effort : sans cette info, les cœurs restent neutres.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session, gameSlug]);

  const fetchCards = useCallback(
    async (
      query: string,
      setCode: string,
      type: string,
      language: string,
      pageNumber: number,
      searchCriteria: CardSearchCriteria | URLSearchParams = EMPTY_CRITERIA
    ) => {
      const trimmedQuery = query.trim();
      lastSearchedQueryRef.current = trimmedQuery;
      const normalizedSetCode = setCode && setCode !== "all" ? setCode : "all";
      const normalizedType = type && type !== "all" ? type : "all";
      const normalizedLanguage = language && language !== "all" ? language : "all";
      const criteriaEntries =
        searchCriteria instanceof URLSearchParams
          ? [...searchCriteria.entries()]
          : serializeCardSearchCriteria(searchCriteria);
      const requestKey = `${trimmedQuery}|${normalizedSetCode}|${normalizedType}|${normalizedLanguage}|${pageNumber}|${new URLSearchParams(criteriaEntries).toString()}`;

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

        if (normalizedLanguage !== "all") {
          params.set("lang", normalizedLanguage);
        }

        for (const [key, value] of criteriaEntries) {
          params.set(key, value);
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
        const nextLanguages = Array.isArray(data) ? [] : data.languages ?? [];
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
        setLanguages(nextLanguages);
        setPagination(nextPagination);

        const nextFacets = Array.isArray(data) ? [] : data.facets ?? [];
        setFacets(nextFacets);
        setFiltersUnavailable(Array.isArray(data) ? false : data.filtersUnavailable === true);

        // Les critères de l'URL n'ont pu être lus qu'une fois les facettes
        // connues : c'est ici qu'un lien partagé retrouve ses filtres.
        if (pendingCriteriaRef.current) {
          const parsed = parseCardSearchCriteria(pendingCriteriaRef.current, nextFacets);
          pendingCriteriaRef.current = null;
          setCriteria(parsed);
          if (countActiveFacetFilters(parsed) > 0) {
            setFiltersOpen(true);
          }
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Erreur lors de la recherche:", error);
        setCards([]);
        setSetCodes([]);
        setTypes([]);
        setLanguages([]);
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

  const updateURL = useCallback((query: string, setCode: string, type: string, language: string, page: number, searchCriteria: CardSearchCriteria = EMPTY_CRITERIA) => {
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

    if (language && language !== "all") {
      params.set("lang", language);
    }

    for (const [key, value] of serializeCardSearchCriteria(searchCriteria)) {
      params.set(key, value);
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
    const urlLanguage = searchParams.get("lang") ?? "all";

    setSearchQuery(urlQuery);
    setCurrentPage(urlPage);
    setSelectedSetCode(urlSetCode);
    setSelectedType(urlType);
    setSelectedLanguage(urlLanguage);

    const urlCriteria = new URLSearchParams(searchParams.toString());
    pendingCriteriaRef.current = urlCriteria;

    void fetchCards(urlQuery, urlSetCode, urlType, urlLanguage, urlPage, urlCriteria);
  }, [fetchCards, searchParams]);

  // Debounced search when typing
  useEffect(() => {
    if (!hasInitializedRef.current) {
      return;
    }

    const trimmedQuery = searchQuery.trim();

    // La requête est déjà celle qui a été cherchée : c'est un autre contrôle qui
    // a changé, et il s'est déjà chargé de relancer la recherche.
    if (lastSearchedQueryRef.current === trimmedQuery) {
      return undefined;
    }

    if (trimmedQuery.length === 0 || trimmedQuery.length > 2) {
      const timer = window.setTimeout(() => {
        void fetchCards(trimmedQuery, selectedSetCode, selectedType, selectedLanguage, 1, criteria);
        setCurrentPage(1);
        updateURL(trimmedQuery, selectedSetCode, selectedType, selectedLanguage, 1, criteria);
      }, trimmedQuery.length === 0 ? 0 : 300);

      return () => window.clearTimeout(timer);
    }

    // Une ou deux lettres ne cherchent pas. La mémoire est effacée avec la
    // liste, pour que revenir à la requête précédente la relance vraiment.
    lastSearchedQueryRef.current = null;
    setCards([]);
    setSetCodes([]);
    setTypes([]);
    setLanguages([]);
    setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
    return undefined;
  }, [searchQuery, selectedSetCode, selectedType, selectedLanguage, criteria, fetchCards, updateURL]);

  const handleSearch = () => {
    const newPage = 1;
    setCurrentPage(newPage);
    void fetchCards(searchQuery, selectedSetCode, selectedType, selectedLanguage, newPage, criteria);
    updateURL(searchQuery, selectedSetCode, selectedType, selectedLanguage, newPage, criteria);
  };

  const handlePageChange = (nextPage: number) => {
    if (nextPage < 1 || nextPage > pagination.totalPages || isLoading) {
      return;
    }

    setCurrentPage(nextPage);
    void fetchCards(searchQuery, selectedSetCode, selectedType, selectedLanguage, nextPage, criteria);
    updateURL(searchQuery, selectedSetCode, selectedType, selectedLanguage, nextPage, criteria);
  };

  const handleSetCodeChange = (value: string) => {
    const newPage = 1;
    setSelectedSetCode(value);
    setCurrentPage(newPage);
    void fetchCards(searchQuery, value, selectedType, selectedLanguage, newPage, criteria);
    updateURL(searchQuery, value, selectedType, selectedLanguage, newPage, criteria);
  };

  const handleTypeChange = (value: string) => {
    const newPage = 1;
    setSelectedType(value);
    setCurrentPage(newPage);
    void fetchCards(searchQuery, selectedSetCode, value, selectedLanguage, newPage, criteria);
    updateURL(searchQuery, selectedSetCode, value, selectedLanguage, newPage, criteria);
  };

  const handleLanguageChange = (value: string) => {
    const newPage = 1;
    setSelectedLanguage(value);
    setCurrentPage(newPage);
    void fetchCards(searchQuery, selectedSetCode, selectedType, value, newPage, criteria);
    updateURL(searchQuery, selectedSetCode, selectedType, value, newPage, criteria);
  };

  const applyCriteria = (next: CardSearchCriteria) => {
    setCriteria(next);
    setCurrentPage(1);
    void fetchCards(searchQuery, selectedSetCode, selectedType, selectedLanguage, 1, next);
    updateURL(searchQuery, selectedSetCode, selectedType, selectedLanguage, 1, next);
  };

  const setRange = (key: string, bound: "min" | "max", raw: string) => {
    const parsed = Number(raw);
    const next = { ...criteria, ranges: { ...criteria.ranges } };
    const range = { ...next.ranges[key] };

    if (raw.trim() === "" || !Number.isFinite(parsed)) {
      delete range[bound];
    } else {
      range[bound] = parsed;
    }

    if (range.min === undefined && range.max === undefined) {
      delete next.ranges[key];
    } else {
      next.ranges[key] = range;
    }

    applyCriteria(next);
  };

  const toggleValue = (key: string, value: string) => {
    const current = criteria.values[key] ?? [];
    const kept = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    const next = { ...criteria, values: { ...criteria.values } };

    if (kept.length > 0) {
      next.values[key] = kept;
    } else {
      delete next.values[key];
    }

    applyCriteria(next);
  };

  const changeSort = (value: string) => {
    if (value === "default") {
      applyCriteria({ ...criteria, sort: undefined });
      return;
    }
    const [key, direction] = value.split(":");
    applyCriteria({ ...criteria, sort: { key, direction: direction === "desc" ? "desc" : "asc" } });
  };

  const clearFacetFilters = () => applyCriteria({ ...criteria, ranges: {}, values: {} });

  const removeRange = (key: string) => {
    const next = { ...criteria, ranges: { ...criteria.ranges } };
    delete next.ranges[key];
    applyCriteria(next);
  };

  /** Remet tout à zéro d'un geste : listes déroulantes, attributs et saisie. */
  const resetAll = () => {
    setSelectedSetCode("all");
    setSelectedType("all");
    setSelectedLanguage("all");
    setSearchQuery("");
    setCurrentPage(1);
    // Le tri part avec le reste : « tout réinitialiser » le laisserait sinon en
    // place, alors que rien à l'écran ne dirait plus qu'il est actif.
    setCriteria(EMPTY_CRITERIA);
    void fetchCards("", "all", "all", "all", 1, EMPTY_CRITERIA);
    updateURL("", "all", "all", "all", 1, EMPTY_CRITERIA);
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      // Un clic répété repart de zéro : sans ça, le premier délai éteindrait la
      // confirmation que le second vient d'allumer.
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setLinkCopied(false);
      }, 2000);
    } catch {
      // Presse-papiers refusé par le navigateur : l'URL reste celle de la barre d'adresse.
    }
  };

  const activeFilterCount = countActiveFacetFilters(criteria);
  // Un attribut se lit mieux capitalisé : les clés sont brutes en base (`energy`).
  const facetLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

  const getLanguageLabel = (language: string) => {
    if (language === "all") {
      return t("cards.search.filters.allLanguages");
    }

    const translationKey = `cards.collection.languages.${language.toLowerCase()}`;
    const translated = t(translationKey);
    return translated === translationKey ? language.toUpperCase() : translated;
  };

  // Le vocabulaire de la barre de recherche vient du catalogue du jeu, comme
  // les filtres : `domain:fury`, `energy<=3`, `set:OGN`… Rien n'est codé par jeu.
  const searchFields = buildSearchFields(facets, { setCodes, types, languages });
  const parsedQuery = parseSearchSyntax(searchQuery, searchFields);
  const suggestions = suggestionsOpen ? suggestTokens(searchQuery, searchFields) : [];
  // Le mot en cours de frappe est forcément incomplet : l'annoncer comme
  // invalide reviendrait à signaler une faute à chaque lettre tapée.
  const typing = currentWord(searchQuery);
  const rejectedTokens = parsedQuery.rejected.filter((rejected) => rejected.raw !== typing);

  const pickSuggestion = (token: string) => {
    setSearchQuery(applyTokenSuggestion(searchQuery, token));
    setActiveSuggestion(-1);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSuggestionsOpen(false);
      setActiveSuggestion(-1);
      return;
    }
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion((index) => (index + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setActiveSuggestion((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
      return;
    }
    if (event.key === "Enter") {
      // Entrée complète la suggestion en cours, ou lance la recherche si aucune
      // n'est sélectionnée : compléter puis chercher restent deux gestes.
      const chosen = suggestions[activeSuggestion];
      if (chosen) {
        event.preventDefault();
        pickSuggestion(chosen.token);
        return;
      }
      setSuggestionsOpen(false);
      handleSearch();
    }
  };

  // Ce qui est filtré, dit d'un coup d'œil et retirable d'un clic — sans avoir
  // à rouvrir la liste déroulante ou la section d'où le filtre vient.
  const activeChips: { key: string; label: string; remove: () => void }[] = [];
  for (const token of parsedQuery.tokens) {
    activeChips.push({
      key: `token-${token.raw}`,
      label: token.label,
      remove: () => setSearchQuery(removeSearchWord(searchQuery, token.raw)),
    });
  }
  if (selectedSetCode !== "all") {
    activeChips.push({
      key: "set",
      label: `${t("cards.search.filters.setCode")} · ${selectedSetCode}`,
      remove: () => handleSetCodeChange("all"),
    });
  }
  if (selectedType !== "all") {
    activeChips.push({
      key: "type",
      label: `${t("cards.search.filters.type")} · ${selectedType}`,
      remove: () => handleTypeChange("all"),
    });
  }
  if (selectedLanguage !== "all") {
    activeChips.push({
      key: "lang",
      label: `${t("cards.search.filters.language")} · ${getLanguageLabel(selectedLanguage)}`,
      remove: () => handleLanguageChange("all"),
    });
  }
  for (const [key, range] of Object.entries(criteria.ranges)) {
    const bounds =
      range.min !== undefined && range.max !== undefined
        ? `${range.min}–${range.max}`
        : range.min !== undefined
          ? `≥ ${range.min}`
          : `≤ ${range.max}`;
    activeChips.push({ key: `range-${key}`, label: `${facetLabel(key)} ${bounds}`, remove: () => removeRange(key) });
  }
  for (const [key, values] of Object.entries(criteria.values)) {
    for (const value of values) {
      activeChips.push({
        key: `value-${key}-${value}`,
        label: `${facetLabel(key)} · ${value}`,
        remove: () => toggleValue(key, value),
      });
    }
  }

  // Les attributs numériques font aussi de bonnes colonnes en vue liste — sans
  // rien coder par jeu, puisqu'ils viennent des facettes.
  const listColumns = facets.filter((facet) => facet.type === "number").slice(0, 3);
  const cardAttribute = (card: CardWithType, key: string) => {
    const value = (card as unknown as Record<string, unknown>)[key];
    return typeof value === "number" || typeof value === "string" ? String(value) : "—";
  };

  const cardRef = (card: CardWithType) => `#${card.setCode}-${card.collectorNumber}`;

  const wishlistButton = (card: CardWithType) =>
    session ? (
      <AddToWishlistButton
        iconOnly
        cardId={card.id}
        gameSlug={gameSlug}
        cardName={card.name}
        setCode={card.setCode}
        collectorNumber={String(card.collectorNumber)}
        image={card.image}
        type={card.type}
        cardFoil={card.foil === true}
        printings={card.printings}
        inWishlist={wishlistedIds.has(card.id)}
        onAdded={() => setWishlistedIds((prev) => new Set(prev).add(card.id))}
      />
    ) : null;

  const sidebar = (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("cards.search.filters.title")}</span>
        {activeChips.length > 0 || searchQuery.trim() ? (
          <button
            type="button"
            onClick={resetAll}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("cards.search.filters.reset")}
          </button>
        ) : null}
      </div>

      {filtersUnavailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          {t("cards.search.filters.unavailable")}
        </p>
      ) : null}

      <FilterSection title={t("cards.search.filters.setCode")}>
        <Select value={selectedSetCode} onValueChange={handleSetCodeChange}>
          <SelectTrigger className="w-full">
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
      </FilterSection>

      <FilterSection title={t("cards.search.filters.type")}>
        <Select value={selectedType} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-full">
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
      </FilterSection>

      <FilterSection title={t("cards.search.filters.language")}>
        <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("cards.search.filters.allLanguages")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("cards.search.filters.allLanguages")}</SelectItem>
            {languages.map((language) => (
              <SelectItem key={language} value={language}>
                {getLanguageLabel(language)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>

      {facets.map((facet) => (
        <FilterSection key={facet.key} title={facetLabel(facet.key)}>
          {facet.type === "number" ? (
            <>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={facet.min}
                  max={facet.max}
                  placeholder={String(facet.min)}
                  aria-label={t("cards.search.filters.min", { field: facetLabel(facet.key) })}
                  value={criteria.ranges[facet.key]?.min ?? ""}
                  onChange={(e) => setRange(facet.key, "min", e.target.value)}
                  className="h-8"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={facet.min}
                  max={facet.max}
                  placeholder={String(facet.max)}
                  aria-label={t("cards.search.filters.max", { field: facetLabel(facet.key) })}
                  value={criteria.ranges[facet.key]?.max ?? ""}
                  onChange={(e) => setRange(facet.key, "max", e.target.value)}
                  className="h-8"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">
                {t("cards.search.filters.range", { min: facet.min, max: facet.max })}
              </span>
            </>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {facet.values.map((value) => (
                <FacetChip
                  key={value}
                  active={(criteria.values[facet.key] ?? []).includes(value)}
                  onClick={() => toggleValue(facet.key, value)}
                >
                  {value}
                </FacetChip>
              ))}
            </div>
          )}
        </FilterSection>
      ))}

      {activeFilterCount > 0 ? (
        <Button variant="outline" size="sm" onClick={clearFacetFilters}>
          {t("cards.search.filters.clear")}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Sur bureau la recherche vit dans une colonne à demeure : les filtres
          restent lisibles pendant qu'on parcourt les résultats, au lieu de
          replier un panneau à chaque essai. Sur mobile, elle se déplie. */}
      <aside className={`${filtersOpen ? "block" : "hidden"} lg:block lg:w-72 lg:shrink-0`}>{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex min-w-[240px] flex-1 items-center">
            <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t("cards.search.placeholder")}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSuggestionsOpen(true);
                setActiveSuggestion(-1);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => setSuggestionsOpen(false)}
              onKeyDown={onSearchKeyDown}
              role="combobox"
              aria-expanded={suggestions.length > 0}
              aria-autocomplete="list"
              aria-controls="card-search-suggestions"
              className="h-10 w-full pl-9 font-mono text-sm"
            />

            {suggestions.length > 0 ? (
              <div
                id="card-search-suggestions"
                role="listbox"
                className="absolute left-0 right-0 top-11 z-20 rounded-lg border bg-popover p-1 shadow-lg"
              >
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.token}
                    type="button"
                    role="option"
                    aria-selected={index === activeSuggestion}
                    // `onMouseDown` plutôt que `onClick` : le clic doit agir
                    // avant que la perte de focus ne referme la liste.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      pickSuggestion(suggestion.token);
                    }}
                    onMouseEnter={() => setActiveSuggestion(index)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm ${
                      index === activeSuggestion ? "bg-muted" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-primary">{suggestion.token}</span>
                    {/* Poussé à droite plutôt qu'aligné sur une colonne fixe :
                        un token long — `type:"Battlefield Rune"` — décalerait
                        toute la colonne des explications. */}
                    <span className="ml-auto truncate text-xs text-muted-foreground">{suggestion.hint}</span>
                  </button>
                ))}
                <p className="px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
                  {parsedQuery.tokens.length > 0
                    ? t("cards.search.syntax.tokens", { count: parsedQuery.tokens.length })
                    : t("cards.search.syntax.invite")}
                </p>
              </div>
            ) : null}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() => setFiltersOpen((open) => !open)}
            className="h-10 lg:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {t("cards.search.filters.title")}
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{activeFilterCount}</span>
            ) : null}
          </Button>

          <Select
            value={criteria.sort ? `${criteria.sort.key}:${criteria.sort.direction}` : "default"}
            onValueChange={changeSort}
          >
            <SelectTrigger className="h-10 w-full sm:w-52" aria-label={t("cards.search.filters.sort")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("cards.search.filters.sortRelevance")}</SelectItem>
              {sortableKeys(facets).flatMap((key) => [
                <SelectItem key={`${key}:asc`} value={`${key}:asc`}>
                  {t("cards.search.filters.sortAsc", { field: facetLabel(key) })}
                </SelectItem>,
                <SelectItem key={`${key}:desc`} value={`${key}:desc`}>
                  {t("cards.search.filters.sortDesc", { field: facetLabel(key) })}
                </SelectItem>,
              ])}
            </SelectContent>
          </Select>

          <div className="flex h-10 items-center gap-1 rounded-md border p-1">
            <button
              type="button"
              onClick={() => setLayout("grid")}
              aria-pressed={layout === "grid"}
              title={t("cards.search.filters.viewGrid")}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs ${
                layout === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span className="hidden sm:inline">{t("cards.search.filters.viewGrid")}</span>
            </button>
            <button
              type="button"
              onClick={() => setLayout("list")}
              aria-pressed={layout === "list"}
              title={t("cards.search.filters.viewList")}
              className={`flex h-8 items-center gap-1.5 rounded px-2 text-xs ${
                layout === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">{t("cards.search.filters.viewList")}</span>
            </button>
          </div>

          {layout === "grid" ? (
            <div className="flex h-10 items-center gap-1 rounded-md border px-2">
              <button
                type="button"
                onClick={() => setDensity((value) => Math.max(0, value - 1))}
                disabled={density === 0}
                aria-label={t("cards.search.filters.densitySmaller")}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="w-4 text-center font-mono text-[11px] text-muted-foreground">{density + 1}</span>
              <button
                type="button"
                onClick={() => setDensity((value) => Math.min(TILE_WIDTHS.length - 1, value + 1))}
                disabled={density === TILE_WIDTHS.length - 1}
                aria-label={t("cards.search.filters.densityBigger")}
                className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}

          <Button onClick={handleSearch} disabled={isLoading} className="h-10">
            {isLoading ? t("cards.search.searching") : t("cards.search.search")}
          </Button>
        </div>

        <div className="flex min-h-6 flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t("cards.search.resultCount", { count: pagination.total })}
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.remove}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
            >
              {chip.label}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-3.5 w-3.5" />
            {linkCopied ? t("cards.search.linkCopied") : t("cards.search.copyLink")}
          </button>
        </div>

        {/* Un token dont le champ est connu mais la valeur inutilisable ne
            filtre rien : le taire donnerait une liste large sans explication. */}
        {rejectedTokens.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
            {rejectedTokens.map((rejected) => (
              <li key={rejected.raw}>
                {t(`cards.search.syntax.rejected.${rejected.reason}`, {
                  token: rejected.raw,
                  field: rejected.field,
                })}
              </li>
            ))}
          </ul>
        ) : null}

        {isLoading && cards.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">{t("cards.search.searching")}</p>
        ) : null}

        {layout === "grid" ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_WIDTHS[density]}px, 1fr))` }}
          >
            {cards.map((card) => (
              <div
                key={`${card.cardId}-${card.setCode}-${card.collectorNumber}`}
                className="relative overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                <Link href={`/games/${gameSlug}/cards/${card.id}`} className="block">
                  {/* Une carte toujours foil se reconnaît dans la liste comme sur sa fiche. */}
                  <div className={`relative overflow-hidden ${card.foil ? "foil-shine" : ""}`}>
                    <Image src={card.image} alt={card.name} width={600} height={840} unoptimized className="w-full" />
                  </div>
                  <div className="flex flex-col gap-0.5 px-2.5 py-2">
                    <span className="text-[13px] font-semibold leading-tight">{card.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{cardRef(card)}</span>
                    {card.type ? (
                      <span className="truncate text-[11px] text-muted-foreground">{card.type}</span>
                    ) : null}
                  </div>
                </Link>
                {session ? <div className="absolute right-1.5 top-1.5 z-10">{wishlistButton(card)}</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden items-center gap-3 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex">
              <span className="w-8" />
              <span className="flex-1">{t("cards.search.columns.name")}</span>
              <span className="w-28">{t("cards.search.columns.type")}</span>
              {listColumns.map((facet) => (
                <span key={facet.key} className="w-16 text-right">
                  {facetLabel(facet.key)}
                </span>
              ))}
              <span className="w-8" />
            </div>
            {cards.map((card) => (
              <div
                key={`${card.cardId}-${card.setCode}-${card.collectorNumber}`}
                className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
              >
                <Link
                  href={`/games/${gameSlug}/cards/${card.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <span className={`relative w-8 shrink-0 overflow-hidden rounded ${card.foil ? "foil-shine" : ""}`}>
                    <Image src={card.image} alt={card.name} width={64} height={90} unoptimized className="w-full" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{card.name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{cardRef(card)}</span>
                  </span>
                  <span className="hidden w-28 truncate text-xs text-muted-foreground sm:block">{card.type ?? "—"}</span>
                  {listColumns.map((facet) => (
                    <span key={facet.key} className="hidden w-16 text-right font-mono text-xs sm:block">
                      {cardAttribute(card, facet.key)}
                    </span>
                  ))}
                </Link>
                <span className="w-8 shrink-0">{wishlistButton(card)}</span>
              </div>
            ))}
          </div>
        )}

        {!isLoading && cards.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">
            {searchQuery.trim()
              ? t("cards.search.noResults", { query: searchQuery })
              : t("cards.search.emptyState")}
          </p>
        ) : null}

        {pagination.totalPages > 1 ? (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
    </div>
  );
}
