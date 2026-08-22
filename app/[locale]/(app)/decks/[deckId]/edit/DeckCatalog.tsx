"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Input } from "@/components/ui/input.tsx";
import { FacetChip, FilterSection } from "@/components/cards/CardFacetFilters.tsx";
import { cardReference, DeckCardThumb } from "@/components/decks/DeckCardThumb.tsx";
import { toDeckCardInfo, type RawCard } from "@/lib/decks/card-info.ts";
import type { CardFilterFacet } from "@/lib/cards/search-filters.ts";
import type { DeckCardInfo } from "@/lib/decks/contents.ts";
import type { DeckZone, DeckZoneKey } from "@/lib/decks/zones.ts";

/** Assez de résultats pour choisir, assez peu pour que la colonne reste lisible. */
const CATALOG_PAGE_SIZE = 24;
/** Même temporisation que la galerie de cartes : la frappe ne déclenche pas une requête par lettre. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Catalogue du jeu, à gauche de l'éditeur.
 *
 * Un clic ajoute un exemplaire dans la zone visée, Alt-clic en retire un : le
 * geste le plus fréquent de la construction d'un deck ne mérite pas un
 * formulaire. La zone visée est explicite — une carte ajoutée doit atterrir là
 * où on l'attend, pas là où un algorithme l'aurait devinée.
 */
export function DeckCatalog({
  gameSlug,
  zones,
  zone,
  onZoneChangeAction,
  onAddAction,
  onPreviewAction,
}: {
  gameSlug: string;
  zones: DeckZone[];
  zone: DeckZoneKey;
  onZoneChangeAction: (zone: DeckZoneKey) => void;
  onAddAction: (card: DeckCardInfo, delta: number) => void;
  onPreviewAction?: (card: DeckCardInfo) => void;
}) {
  const [query, setQuery] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [domainValues, setDomainValues] = useState<string[]>([]);
  const [cards, setCards] = useState<DeckCardInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const activeZone = zones.find((entry) => entry.key === zone);

  const fetchCards = useCallback(
    async (search: string, selectedDomains: string[]) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setLoading(true);

      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set("searchQuery", search.trim());
        for (const domain of selectedDomains) params.append("domain", domain);
        params.set("limit", String(CATALOG_PAGE_SIZE));

        const response = await fetch(`/api/games/${gameSlug}/cards?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Recherche impossible (${response.status})`);

        const data: { cards?: RawCard[]; total?: number; facets?: CardFilterFacet[] } =
          await response.json();
        if (controller.signal.aborted) return;

        setCards((data.cards ?? []).map(toDeckCardInfo));
        setTotal(data.total ?? 0);

        // Les valeurs de domaine sortent des facettes du jeu : les écrire ici
        // ferait de Riftbound le seul jeu servi par cet éditeur.
        const facet = data.facets?.find((entry) => entry.key === "domain");
        if (facet && facet.type === "value") {
          setDomainValues(facet.values);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Erreur lors de la recherche de cartes:", error);
        setCards([]);
        setTotal(0);
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      }
    },
    [gameSlug]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchCards(query, domains), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [query, domains, fetchCards]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <div className="flex flex-col gap-3.5 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Catalogue</h2>
        <span className="text-xs text-muted-foreground">
          {loading ? "recherche…" : `${total} carte${total > 1 ? "s" : ""}`}
        </span>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={"domain:fureur energy<=3"}
          className="h-10 pl-9"
          aria-label="Rechercher une carte"
        />
      </div>

      {domainValues.length > 0 && (
        <FilterSection title="Domaine">
          <div className="flex flex-wrap gap-1.5">
            {domainValues.map((value) => (
              <FacetChip
                key={value}
                active={domains.includes(value)}
                onClick={() =>
                  setDomains((current) =>
                    current.includes(value)
                      ? current.filter((entry) => entry !== value)
                      : [...current, value]
                  )
                }
              >
                {value}
              </FacetChip>
            ))}
          </div>
        </FilterSection>
      )}

      <FilterSection title="Zone d'ajout">
        <div className="flex flex-wrap gap-1.5">
          {zones.map((entry) => (
            <FacetChip key={entry.key} active={entry.key === zone} onClick={() => onZoneChangeAction(entry.key)}>
              {entry.short}
            </FacetChip>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Les cartes ajoutées vont dans «&nbsp;{activeZone?.label ?? "?"}&nbsp;».
        </p>
      </FilterSection>

      {loading && cards.length === 0 ? (
        <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Chargement...
        </p>
      ) : cards.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">Aucune carte ne correspond à cette recherche.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(96px,1fr))] gap-2.5">
          {cards.map((card) => (
            <li key={card.id}>
              <button
                type="button"
                onClick={(event) => onAddAction(card, event.altKey ? -1 : 1)}
                onMouseEnter={() => onPreviewAction?.(card)}
                onFocus={() => onPreviewAction?.(card)}
                title={`${card.name} — clic pour ajouter, Alt-clic pour retirer`}
                className="flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors hover:bg-muted"
              >
                <DeckCardThumb card={card} className="rounded-none border-0" />
                <span className="flex flex-col gap-px px-2 py-1.5">
                  <span className="truncate text-xs font-semibold">{card.name}</span>
                  {cardReference(card) && (
                    <span className="font-mono text-[10px] text-muted-foreground">{cardReference(card)}</span>
                  )}
                  <span className="truncate text-[11px] text-muted-foreground">
                    {[card.type, card.cost !== undefined ? `coût ${card.cost}` : undefined]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Clic : +1 dans la zone choisie. Alt-clic : −1.
      </p>
    </div>
  );
}
