"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  countActiveFacetFilters,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";
import { buildSearchFields } from "@/lib/cards/search-syntax";
import { CardFacetFilters } from "./CardFacetFilters";
import { CardSearchInput } from "./CardSearchInput";

/**
 * Barre de recherche de cartes des éditeurs (booster, paquet de cube) : la
 * saisie, un bouton de filtrage, et les filtres du jeu dessous.
 *
 * Les filtres sont repliés par défaut : ici on ajoute des cartes qu'on connaît
 * déjà la plupart du temps, et le panneau prendrait la place des résultats. Le
 * bouton porte le nombre de filtres actifs, pour qu'un panneau refermé ne
 * laisse jamais croire à une recherche sans critère.
 */
export function CardSearchToolbar({
  query,
  onQueryChange,
  criteria,
  onCriteriaChange,
  facets,
  setCodes,
  types,
  languages,
  filtersUnavailable = false,
  filtersPending = false,
  placeholder,
  inputRef,
  onInputKeyDown,
  children,
}: {
  query: string;
  onQueryChange: (next: string) => void;
  criteria: CardSearchCriteria;
  onCriteriaChange: (next: CardSearchCriteria) => void;
  facets: CardFilterFacet[];
  setCodes: string[];
  types: string[];
  languages: string[];
  filtersUnavailable?: boolean;
  /** Les facettes ne sont pas encore arrivées : on ne conclut rien d'une liste vide. */
  filtersPending?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  onInputKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Contrôles propres à l'éditeur, posés à droite de la saisie (extension…). */
  children?: React.ReactNode;
}) {
  const t = useTranslations("Games");
  const [open, setOpen] = useState(false);
  const activeCount = countActiveFacetFilters(criteria);
  // Le vocabulaire de la saisie vient du catalogue du jeu, comme les filtres :
  // `domain:fury`, `energy<=3`, `set:OGN`… Rien n'est codé par jeu.
  const fields = buildSearchFields(facets, { setCodes, types, languages });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <CardSearchInput
          value={query}
          onChange={onQueryChange}
          fields={fields}
          placeholder={placeholder}
          inputRef={inputRef}
          // Les suggestions s'ouvrent à la frappe seulement : à la prise de
          // focus, elles prendraient les flèches qui mènent aux résultats.
          openOnFocus={false}
          onKeyDown={onInputKeyDown}
          className="h-10 w-full pl-9"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-expanded={open}
            aria-label={t("cards.search.filters.title")}
            title={t("cards.search.filters.title")}
            onClick={() => setOpen((current) => !current)}
            className="relative h-10"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {activeCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                {activeCount}
              </span>
            ) : null}
          </Button>
          {children}
        </div>
      </div>

      {open ? (
        <div className="rounded-xl border bg-card p-4">
          <CardFacetFilters
            facets={facets}
            criteria={criteria}
            onChange={onCriteriaChange}
            unavailable={filtersUnavailable}
            pending={filtersPending}
            layout="grid"
          />
        </div>
      ) : null}
    </div>
  );
}
