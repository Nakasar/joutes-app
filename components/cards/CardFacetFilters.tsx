"use client";

import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  countActiveFacetFilters,
  withRangeBound,
  withToggledValue,
  withoutFacetFilters,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";

/** Un attribut se lit mieux capitalisé : les clés sont brutes en base (`energy`). */
export function facetLabel(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** Une section de filtres : un intitulé discret, puis ses contrôles. */
export function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
      {children}
    </div>
  );
}

/** Valeur d'attribut à cocher. Un bouton plutôt qu'une case : plus compact, et la liste en compte souvent une dizaine. */
export function FacetChip({
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

/**
 * Filtres tirés des attributs que porte réellement le jeu : plages pour les
 * attributs numériques (énergie, puissance, might…), valeurs à cocher pour les
 * autres (domaines, raretés…).
 *
 * Partagé par la galerie de cartes et par les éditeurs de booster et de paquet
 * de cube. C'est le même vocabulaire, tiré des mêmes facettes : il ne se règle
 * pas de deux façons selon l'écran où l'on cherche une carte.
 */
export function CardFacetFilters({
  facets,
  criteria,
  onChange,
  unavailable = false,
  layout = "column",
}: {
  facets: CardFilterFacet[];
  criteria: CardSearchCriteria;
  onChange: (next: CardSearchCriteria) => void;
  /** L'index n'accepte pas encore ces filtres : les résultats les ignorent. */
  unavailable?: boolean;
  /** En colonne dans une barre latérale, en grille dans un panneau dépliant. */
  layout?: "column" | "grid";
}) {
  const t = useTranslations("Games");
  const activeCount = countActiveFacetFilters(criteria);

  return (
    <div className="flex flex-col gap-4">
      {unavailable ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
          {t("cards.search.filters.unavailable")}
        </p>
      ) : null}

      <div
        className={
          layout === "grid"
            ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            : "flex flex-col gap-5"
        }
      >
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
                    onChange={(e) => onChange(withRangeBound(criteria, facet.key, "min", e.target.value))}
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
                    onChange={(e) => onChange(withRangeBound(criteria, facet.key, "max", e.target.value))}
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
                    onClick={() => onChange(withToggledValue(criteria, facet.key, value))}
                  >
                    {value}
                  </FacetChip>
                ))}
              </div>
            )}
          </FilterSection>
        ))}
      </div>

      {activeCount > 0 ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onChange(withoutFacetFilters(criteria))}
        >
          {t("cards.search.filters.clear")}
        </Button>
      ) : null}
    </div>
  );
}
