"use client";

import { useCallback, useEffect, useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Hammer, Library, Loader2, Plus, Search, Share2, Star } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Link, usePathname, useRouter } from "@/i18n/navigation.ts";
import { DeckLegalityBadge, DeckSizeLabel, DeckVisibilityBadge } from "@/components/decks/DeckBadges.tsx";
import { ShareDeckDialog } from "@/components/decks/ShareDeckDialog.tsx";
import { cn } from "@/lib/utils.ts";
import { getDeckZones } from "@/lib/decks/zones.ts";
import type { PaginatedDecksResult } from "@/lib/db/decks.ts";
import type { Deck, DeckVisibility } from "@/lib/types/Deck.ts";
import type { Game } from "@/lib/types/Game.ts";
import CreateDeckDialog from "@/components/decks/CreateDeckDialog.tsx";

/** Onglets de tri de la page : ce que l'on cherche dans ses propres decks. */
type DecksTab = "all" | "draft" | "published" | "favorites";

const TABS: { key: DecksTab; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "draft", label: "En cours" },
  { key: "published", label: "Publiés" },
  { key: "favorites", label: "Favoris" },
];

const SEARCH_DEBOUNCE_MS = 500;

type DecksClientProps = {
  initialData: PaginatedDecksResult;
  games: Game[];
  currentUserId: string;
  initialFilters: {
    gameId?: string;
    favoritesOnly?: boolean;
  };
};

/**
 * « Mes decks » : la bibliothèque personnelle.
 *
 * Les onglets remplacent les interrupteurs d'autrefois — chercher ses
 * brouillons, ses listes publiées ou ses favoris sont trois gestes distincts,
 * pas trois cases à cocher qui se combinent.
 */
export default function DecksClient({ initialData, games, currentUserId, initialFilters }: DecksClientProps) {
  const pathname = usePathname();
  const router = useRouter();

  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [tab, setTab] = useState<DecksTab>(initialFilters.favoritesOnly ? "favorites" : "all");
  const [gameId, setGameId] = useState(initialFilters.gameId ?? "all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [sharing, setSharing] = useState<Deck | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchDecks = useCallback(
    async (currentTab: DecksTab, currentGameId: string, currentSearch: string, page: number) => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams({ scope: "mine", page: String(page), limit: "20" });
        if (currentGameId !== "all") params.set("gameId", currentGameId);
        if (currentSearch) params.set("search", currentSearch);
        if (currentTab === "favorites") params.set("favoritesOnly", "true");
        if (currentTab === "published") params.set("visibility", "public");
        if (currentTab === "draft") {
          // « En cours » = pas encore publié : le privé comme le non répertorié.
          params.append("visibility", "private");
          params.append("visibility", "unlisted");
        }

        const response = await fetch(`/api/decks?${params.toString()}`);
        const result = await response.json();

        if (response.ok) {
          setData(result);
        } else {
          console.error("Error fetching decks:", result.error);
        }
      } catch (error) {
        console.error("Error fetching decks:", error);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void fetchDecks(tab, gameId, debouncedSearch, 1);

    const params = new URLSearchParams();
    if (gameId !== "all") params.set("gameId", gameId);
    if (tab === "favorites") params.set("favoritesOnly", "true");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [tab, gameId, debouncedSearch, fetchDecks, pathname, router]);

  const refresh = () => void fetchDecks(tab, gameId, debouncedSearch, data.page);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              aria-pressed={tab === entry.key}
              className={cn(
                "h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors",
                tab === entry.key ? "bg-primary text-primary-foreground" : "border text-muted-foreground"
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline">
            <Link href="/decks/library">
              <Library />
              Explorer la librairie
            </Link>
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            Nouveau deck
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, légende, description…"
            className="h-10 pl-9"
            aria-label="Rechercher dans mes decks"
          />
        </div>
        <Select value={gameId} onValueChange={setGameId}>
          <SelectTrigger className="h-10 w-52">
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

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>
          {data.total} deck{data.total > 1 ? "s" : ""}
        </span>
        {isLoading && (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Chargement...
          </span>
        )}
      </div>

      {data.decks.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-card p-12 text-center">
          <Library className="size-16 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">Aucun deck ne correspond à vos critères.</p>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus />
            Créer mon premier deck
          </Button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {data.decks.map((deck) => (
            <DeckCard
              key={deck.id}
              deck={deck}
              game={games.find((game) => game.id === deck.gameId)}
              currentUserId={currentUserId}
              onShareAction={() => setSharing(deck)}
              onAfterFavoriteAction={refresh}
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
            disabled={data.page <= 1 || isLoading}
            onClick={() => void fetchDecks(tab, gameId, debouncedSearch, data.page - 1)}
          >
            <ChevronLeft />
            Précédent
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {data.page} sur {data.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.page >= data.totalPages || isLoading}
            onClick={() => void fetchDecks(tab, gameId, debouncedSearch, data.page + 1)}
          >
            Suivant
            <ChevronRight />
          </Button>
        </div>
      )}

      <CreateDeckDialog
        games={games}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          refresh();
        }}
      />

      {sharing && (
        <ShareDeckDialog
          open
          onOpenChange={(open) => !open && setSharing(null)}
          deckId={sharing.id}
          deckName={sharing.name}
          visibility={sharing.visibility}
          onVisibilityChangeAction={async (next) => {
            const response = await fetch(`/api/decks/${sharing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ visibility: next }),
            }).catch(() => null);

            if (response?.ok) {
              setSharing(null);
              refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function DeckCard({
  deck,
  game,
  currentUserId,
  onShareAction,
  onAfterFavoriteAction,
}: {
  deck: Deck;
  game?: Game;
  currentUserId: string;
  onShareAction: () => void;
  onAfterFavoriteAction: () => void;
}) {
  const zones = getDeckZones(game);
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");
  const [favorited, setFavorited] = useState((deck.favoritedBy ?? []).includes(currentUserId));
  const [count, setCount] = useState(deck.favoritesCount ?? 0);

  const toggleFavorite = async () => {
    const next = !favorited;
    setFavorited(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));

    const response = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    }).catch(() => null);

    if (!response?.ok) {
      setFavorited(!next);
      setCount((current) => Math.max(0, current + (next ? -1 : 1)));
      return;
    }

    onAfterFavoriteAction();
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Link href={`/decks/${deck.id}`} className="min-w-0 truncate text-lg font-semibold hover:underline">
          {deck.name}
        </Link>
        <DeckVisibilityBadge visibility={deck.visibility as DeckVisibility} />
      </div>

      <p className="truncate text-sm text-muted-foreground">
        {[game?.name, deck.legendName, deck.format].filter(Boolean).join(" · ") || "—"}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <DeckLegalityBadge cards={deck.cards} zones={zones} />
        <DeckSizeLabel cards={deck.cards} zones={zones} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Modifié {updatedAt.toRelative()}</span>
        <button
          type="button"
          onClick={toggleFavorite}
          aria-label={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
          className="inline-flex shrink-0 items-center gap-1 hover:text-foreground"
        >
          <Star className={cn("size-3.5", favorited && "fill-current text-primary")} />
          {count}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm" className="min-w-28 flex-1">
          <Link href={`/decks/${deck.id}/edit`}>
            <Hammer />
            Modifier
          </Link>
        </Button>
        <Button type="button" variant="outline" size="sm" className="min-w-28 flex-1" onClick={onShareAction}>
          <Share2 />
          Partager
        </Button>
      </div>
    </article>
  );
}
