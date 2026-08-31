"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown, Library, Loader2, Plus, Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { FacetChip } from "@/components/cards/CardFacetFilters.tsx";
import { SegmentedControl } from "@/components/decks/SegmentedControl.tsx";
import { DeckLibraryCard } from "@/components/decks/DeckLibraryCard.tsx";
import { Link, usePathname, useRouter } from "@/i18n/navigation.ts";
import { cn } from "@/lib/utils.ts";
import type { PaginatedDecksResult } from "@/lib/db/decks.ts";
import type { DeckLegendFacet } from "@/lib/db/decks.ts";
import type { Deck } from "@/lib/types/Deck.ts";
import type { Game } from "@/lib/types/Game.ts";
import {
  EMPTY_LIBRARY_FILTERS,
  buildLibraryParams,
  librarySortOptions,
  type LibraryFilters,
  type LibrarySort,
} from "@/lib/decks/library-filters.ts";

/** Même temporisation que les filtres de decks existants : la frappe ne pilote pas la base. */
const FILTER_DEBOUNCE_MS = 500;
const SEARCH_DEBOUNCE_MS = 250;

const SORTS: { value: LibrarySort; label: string }[] = [
  { value: "popular", label: "Populaires" },
  { value: "recent", label: "Récents" },
  { value: "favorites", label: "Mes favoris" },
];

/**
 * Librairie publique de decks.
 *
 * Les filtres vivent dans l'URL : un lien vers « les decks Fureur en Standard,
 * triés par popularité » doit s'envoyer et se remettre en favori comme
 * n'importe quelle page.
 *
 * `lockedGameId` la rend réutilisable sous un jeu (`/games/:slug/decks`) : le
 * jeu cesse alors d'être un filtre — il est déjà dit par l'adresse. Le sélecteur
 * et la pastille disparaissent, et le paramètre sort de l'URL, qui ne
 * répéterait sinon en question ce que le chemin affirme.
 */
export function DeckLibraryClient({
  initialData,
  initialFilters,
  games,
  legends: initialLegends,
  domainValues,
  currentUserId,
  lockedGameId,
}: {
  initialData: PaginatedDecksResult;
  initialFilters: LibraryFilters;
  games: Game[];
  legends: DeckLegendFacet[];
  domainValues: string[];
  currentUserId?: string;
  lockedGameId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [filters, setFilters] = useState<LibraryFilters>(initialFilters);
  const [search, setSearch] = useState(initialFilters.search);
  const [data, setData] = useState(initialData);
  const [legends, setLegends] = useState(initialLegends);
  const [legendOpen, setLegendOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const firstRenderRef = useRef(true);
  const controllerRef = useRef<AbortController | null>(null);

  const formats = games.find((game) => game.id === filters.gameId)?.formats ?? [];

  // La saisie et les filtres n'ont pas la même urgence : la première suit la
  // frappe, les seconds attendent que la main se pose.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setFilters((current) => ({ ...current, search })),
      SEARCH_DEBOUNCE_MS
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchDecks = useCallback(
    async (current: LibraryFilters, pageNumber: number) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);

      try {
        const params = buildLibraryParams(current);
        const { sortBy, favoritesOnly } = librarySortOptions(current.sort);
        params.set("sortBy", sortBy);
        if (favoritesOnly || current.favoritesOnly) params.set("favoritesOnly", "true");
        params.delete("sort");
        params.set("scope", "public");
        params.set("page", String(pageNumber));
        params.set("limit", "20");

        const response = await fetch(`/api/decks?${params.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`Recherche impossible (${response.status})`);

        const result: PaginatedDecksResult = await response.json();
        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Error fetching decks:", error);
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    // Le premier rendu affiche déjà les résultats préparés par le serveur :
    // les redemander ferait clignoter la grille pour rien.
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      setPage(1);
      void fetchDecks(filters, 1);
      const params = buildLibraryParams(filters);
      // Le jeu imposé est déjà dans le chemin : le répéter en paramètre ferait
      // une adresse plus longue qui ne dit rien de plus.
      if (lockedGameId) params.delete("gameId");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, FILTER_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [filters, fetchDecks, pathname, router, lockedGameId]);

  // La liste des légendes dépend du jeu retenu : garder celles d'un autre jeu
  // proposerait des filtres qui ne rendent jamais rien.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const params = filters.gameId !== "all" ? `?gameId=${encodeURIComponent(filters.gameId)}` : "";
      const response = await fetch(`/api/decks/legends${params}`).catch(() => null);
      if (!response?.ok) return;
      const result: { legends?: DeckLegendFacet[] } = await response.json();
      if (!cancelled) setLegends(result.legends ?? []);
    })();

    return () => {
      cancelled = true;
    };
  }, [filters.gameId]);

  const update = (patch: Partial<LibraryFilters>) => setFilters((current) => ({ ...current, ...patch }));

  const selectedLegend = legends.find((legend) => legend.cardId === filters.legendCardId);

  const activeChips = [
    !lockedGameId && filters.gameId !== "all" && {
      label: games.find((game) => game.id === filters.gameId)?.name ?? "Jeu",
      clear: () => update({ gameId: "all", format: "all", legendCardId: "" }),
    },
    filters.format !== "all" && { label: filters.format, clear: () => update({ format: "all" }) },
    selectedLegend && { label: selectedLegend.name, clear: () => update({ legendCardId: "" }) },
    ...filters.domains.map((domain) => ({
      label: `Domaine · ${domain}`,
      clear: () => update({ domains: filters.domains.filter((entry) => entry !== domain) }),
    })),
    filters.favoritesOnly && { label: "Mes favoris", clear: () => update({ favoritesOnly: false }) },
  ].filter(Boolean) as { label: string; clear: () => void }[];

  return (
    <div className="grid gap-6 lg:grid-cols-[272px_1fr] lg:items-start">
      <aside className="flex flex-col gap-4.5 rounded-xl border bg-card p-4 lg:sticky lg:top-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <SlidersHorizontal className="size-4" />
            Filtres
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              // Le jeu imposé n'est pas un filtre : une remise à zéro qui le
              // retirerait ouvrirait la page d'un jeu sur les decks de tous.
              setFilters({ ...EMPTY_LIBRARY_FILTERS, gameId: lockedGameId ?? "all" });
            }}
          >
            Réinitialiser
          </Button>
        </div>

        {!lockedGameId && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="library-game">Jeu</Label>
            <Select
              value={filters.gameId}
              onValueChange={(value) => update({ gameId: value, format: "all", legendCardId: "" })}
            >
              <SelectTrigger id="library-game">
                <SelectValue placeholder="Tous les jeux" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les jeux</SelectItem>
                {games.map((game) => (
                  <SelectItem key={game.id} value={game.id}>
                    {game.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {formats.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="library-format">Format</Label>
            <Select value={filters.format} onValueChange={(value) => update({ format: value })}>
              <SelectTrigger id="library-format">
                <SelectValue placeholder="Tous les formats" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les formats</SelectItem>
                {formats.map((format) => (
                  <SelectItem key={format.name} value={format.name}>
                    {format.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {legends.length > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Légende</Label>
            <Popover open={legendOpen} onOpenChange={setLegendOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={legendOpen}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn("truncate", !selectedLegend && "text-muted-foreground")}>
                    {selectedLegend?.name ?? "Toutes les légendes"}
                  </span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[248px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Rechercher une légende…" />
                  <CommandList className="max-h-[300px]">
                    <CommandEmpty>Aucune légende.</CommandEmpty>
                    <CommandGroup>
                      {legends.map((legend) => (
                        <CommandItem
                          key={legend.cardId}
                          value={legend.name}
                          onSelect={() => {
                            // Re-cliquer l'option retenue la désélectionne : le
                            // filtre se retire là où on l'a posé.
                            update({
                              legendCardId: filters.legendCardId === legend.cardId ? "" : legend.cardId,
                            });
                            setLegendOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              filters.legendCardId === legend.cardId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="min-w-0 flex-1 truncate">{legend.name}</span>
                          <span className="ml-2 shrink-0 text-[11px] text-muted-foreground">
                            {legend.count}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        )}

        {domainValues.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Domaines
            </span>
            <div className="flex flex-wrap gap-1.5">
              {domainValues.map((domain) => (
                <FacetChip
                  key={domain}
                  active={filters.domains.includes(domain)}
                  onClick={() =>
                    update({
                      domains: filters.domains.includes(domain)
                        ? filters.domains.filter((entry) => entry !== domain)
                        : [...filters.domains, domain],
                    })
                  }
                >
                  {domain}
                </FacetChip>
              ))}
            </div>
          </div>
        )}

        {currentUserId && (
          <div className="flex items-center gap-2">
            <Switch
              id="library-favorites"
              checked={filters.favoritesOnly}
              onCheckedChange={(checked) => update({ favoritesOnly: checked })}
            />
            <Label htmlFor="library-favorites">Mes favoris seulement</Label>
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nom, légende, archétype…"
              className="h-10 pl-9"
              aria-label="Rechercher un deck"
            />
          </div>
          <SegmentedControl
            label="Tri des résultats"
            value={filters.sort}
            options={SORTS.map((sort) => ({ value: sort.value, label: sort.label }))}
            /*
              Le tri ne touche pas à l'interrupteur « Mes favoris » : c'est
              `librarySortOptions` qui décide que l'onglet « Mes favoris » filtre.
              Les coupler laisserait le filtre posé après un retour sur
              « Populaires ».
            */
            onChange={(value) => update({ sort: value })}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>
            {data.total} deck{data.total > 1 ? "s" : ""} publié{data.total > 1 ? "s" : ""}
          </span>
          {loading && (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              Chargement...
            </span>
          )}
          {activeChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.clear}
              className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs hover:bg-muted/70"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
        </div>

        {data.decks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-12 text-center">
            <Library className="size-16 text-muted-foreground" />
            <p className="text-lg text-muted-foreground">
              Aucun deck publié ne correspond à ces critères.
            </p>
            <Button asChild>
              <Link href="/decks">
                <Plus />
                Publier un de mes decks
              </Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.decks.map((deck: Deck) => (
              <DeckLibraryCard
                key={deck.id}
                deck={deck}
                gameName={games.find((game) => game.id === deck.gameId)?.name}
                isFavorited={Boolean(currentUserId && deck.favoritedBy?.includes(currentUserId))}
                canInteract={Boolean(currentUserId)}
              />
            ))}
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => {
                const next = page - 1;
                setPage(next);
                void fetchDecks(filters, next);
              }}
            >
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} sur {data.totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages || loading}
              onClick={() => {
                const next = page + 1;
                setPage(next);
                void fetchDecks(filters, next);
              }}
            >
              Suivant
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
