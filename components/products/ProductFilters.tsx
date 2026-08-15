"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardFacetFilters, FilterSection, facetLabel } from "@/components/cards/CardFacetFilters";
import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import { ALL_EDITIONS } from "@/lib/constants/product-editions";
import {
  EMPTY_CRITERIA,
  withToggledValue,
  withoutRange,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";
import { currentWord, parseSearchSyntax, removeSearchWord, type SearchField } from "@/lib/cards/search-syntax";
import type { ProductFacet } from "@/lib/products/search";

export type ProductShape = "all" | "containers" | "units";
export type ProductOwnership = "all" | "owned" | "unowned";

export type ProductFilterState = {
  setCode: string;
  kind: string;
  edition: string;
  shape: ProductShape;
  ownership: ProductOwnership;
  criteria: CardSearchCriteria;
};

export const EMPTY_PRODUCT_FILTERS: Omit<ProductFilterState, "edition"> = {
  setCode: "all",
  kind: "all",
  shape: "all",
  ownership: "all",
  criteria: EMPTY_CRITERIA,
};

/**
 * Ce qui filtre en ce moment, dit d'un coup d'œil et retirable d'un clic —
 * y compris les tokens tapés dans la barre, qu'on enlève sans revenir éditer la
 * saisie au caractère près.
 */
export function ProductFilterChips({
  search,
  onSearchChange,
  fields,
  state,
  onChange,
  editions,
}: {
  search: string;
  onSearchChange: (next: string) => void;
  fields: SearchField[];
  state: ProductFilterState;
  onChange: (next: Partial<ProductFilterState>) => void;
  editions: string[];
}) {
  const t = useTranslations("Collection.products");
  // Les avertissements de syntaxe sont ceux de la recherche de cartes : c'est la
  // même syntaxe, elle s'explique de la même façon.
  const tSyntax = useTranslations("Games.cards.search.syntax");

  const parsed = parseSearchSyntax(search, fields);
  // Le mot en cours de frappe est forcément incomplet : l'annoncer comme
  // invalide reviendrait à signaler une faute à chaque lettre tapée.
  const typing = currentWord(search);
  const rejected = parsed.rejected.filter((token) => token.raw !== typing);

  const chips: { key: string; label: string; remove: () => void }[] = parsed.tokens.map((token, index) => ({
    // L'index fait partie de la clé : rien n'empêche de taper deux fois le même
    // token, et chaque pastille en retire alors une occurrence.
    key: `token-${index}-${token.raw}`,
    label: token.label,
    remove: () => onSearchChange(removeSearchWord(search, token.raw)),
  }));

  if (state.setCode !== "all") {
    chips.push({
      key: "set",
      label: `${t("filters.set")} · ${state.setCode}`,
      remove: () => onChange({ setCode: "all" }),
    });
  }
  if (editions.length > 0 && state.edition !== ALL_EDITIONS) {
    chips.push({
      key: "edition",
      label: `${t("filters.edition")} · ${state.edition}`,
      remove: () => onChange({ edition: ALL_EDITIONS }),
    });
  }
  if (state.kind !== "all") {
    chips.push({
      key: "kind",
      label: `${t("filters.kind")} · ${t(`kinds.${state.kind}`)}`,
      remove: () => onChange({ kind: "all" }),
    });
  }
  if (state.shape !== "all") {
    chips.push({
      key: "shape",
      label: t(`filters.shape.${state.shape}`),
      remove: () => onChange({ shape: "all" }),
    });
  }
  if (state.ownership !== "all") {
    chips.push({
      key: "ownership",
      label: t(`filters.${state.ownership}`),
      remove: () => onChange({ ownership: "all" }),
    });
  }

  for (const [key, range] of Object.entries(state.criteria.ranges)) {
    const bounds =
      range.min !== undefined && range.max !== undefined
        ? `${range.min}–${range.max}`
        : range.min !== undefined
          ? `≥ ${range.min}`
          : `≤ ${range.max}`;
    chips.push({
      key: `range-${key}`,
      label: `${facetLabel(key)} ${bounds}`,
      remove: () => onChange({ criteria: withoutRange(state.criteria, key) }),
    });
  }

  for (const [key, values] of Object.entries(state.criteria.values)) {
    for (const value of values) {
      chips.push({
        key: `value-${key}-${value}`,
        label: `${facetLabel(key)} · ${value}`,
        remove: () => onChange({ criteria: withToggledValue(state.criteria, key, value) }),
      });
    }
  }

  if (chips.length === 0 && rejected.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.map((chip) => (
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
      </div>

      {/* Un token dont le champ est connu mais la valeur inutilisable ne filtre
          rien : le taire donnerait une liste large sans explication. */}
      {rejected.length > 0 ? (
        <ul className="flex flex-col gap-0.5 text-xs text-amber-700 dark:text-amber-400">
          {rejected.map((token, index) => (
            <li key={`${index}-${token.raw}`}>
              {tSyntax(`rejected.${token.reason}`, { token: token.raw, field: token.field })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Une rangée de boutons exclusifs — forme du produit, possession. Plus compacte
 * qu'une liste déroulante pour trois valeurs, et l'état s'y lit sans l'ouvrir.
 */
function ToggleRow<T extends string>({
  values,
  active,
  onChange,
  label,
}: {
  values: readonly T[];
  active: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
}) {
  return (
    <div className="inline-flex w-full items-center rounded-lg border bg-muted/40 p-0.5 text-sm">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={active === value}
          onClick={() => onChange(value)}
          className={`flex-1 rounded-md px-2 py-1 text-xs transition-colors ${
            active === value ? "bg-background shadow-sm" : "text-muted-foreground"
          }`}
        >
          {label(value)}
        </button>
      ))}
    </div>
  );
}

/**
 * Colonne de filtres du catalogue de produits, sur le modèle de la recherche de
 * cartes : les listes closes en haut — gamme, type, forme, possession —, puis
 * les attributs que le jeu déclare vraiment.
 *
 * Partagée par le catalogue public et par la collection, qui ne diffèrent que
 * par deux sections : la possession n'a de sens qu'avec un compte, et l'édition
 * se règle depuis les statistiques quand il y en a.
 */
export function ProductFilters({
  state,
  onChange,
  setCodes,
  editions,
  facets,
  showOwnership = false,
  showEdition = true,
  resettable,
  onReset,
}: {
  state: ProductFilterState;
  onChange: (next: Partial<ProductFilterState>) => void;
  setCodes: string[];
  editions: string[];
  facets: ProductFacet[];
  showOwnership?: boolean;
  /** Faux quand l'édition se choisit ailleurs — au-dessus des statistiques. */
  showEdition?: boolean;
  resettable: boolean;
  onReset: () => void;
}) {
  const t = useTranslations("Collection.products");

  return (
    <div className="flex flex-col gap-5 rounded-xl border bg-card p-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("filters.title")}</span>
        {resettable ? (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("filters.reset")}
          </button>
        ) : null}
      </div>

      {setCodes.length > 0 ? (
        <FilterSection title={t("filters.set")}>
          <Select value={state.setCode} onValueChange={(value) => onChange({ setCode: value })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("filters.allSets")}</SelectItem>
              {setCodes.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      ) : null}

      {showEdition && editions.length > 0 ? (
        <FilterSection title={t("filters.edition")}>
          <Select value={state.edition} onValueChange={(value) => onChange({ edition: value })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_EDITIONS}>{t("filters.allEditions")}</SelectItem>
              {editions.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      ) : null}

      <FilterSection title={t("filters.kind")}>
        <Select value={state.kind} onValueChange={(value) => onChange({ kind: value })}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.allKinds")}</SelectItem>
            {PRODUCT_KIND_KEYS.map((key) => (
              <SelectItem key={key} value={key}>
                {t(`kinds.${key}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>

      <FilterSection title={t("filters.shapeTitle")}>
        <ToggleRow
          values={["all", "containers", "units"] as const}
          active={state.shape}
          onChange={(shape) => onChange({ shape })}
          label={(value) => t(`filters.shape.${value}`)}
        />
      </FilterSection>

      {showOwnership ? (
        <FilterSection title={t("filters.ownershipTitle")}>
          <ToggleRow
            values={["all", "owned", "unowned"] as const}
            active={state.ownership}
            onChange={(ownership) => onChange({ ownership })}
            label={(value) => t(`filters.${value}`)}
          />
        </FilterSection>
      ) : null}

      {/* Les attributs du jeu, dans le même composant que la galerie de cartes :
          une facette se filtre de la même façon qu'on cherche une carte ou une
          figurine. */}
      <CardFacetFilters
        facets={facets}
        criteria={state.criteria}
        onChange={(criteria) => onChange({ criteria })}
      />
    </div>
  );
}
