import { PRODUCT_KIND_KEYS } from "@/lib/constants/product-kinds";
import {
  EMPTY_CRITERIA,
  type CardFilterFacet,
  type CardSearchCriteria,
} from "@/lib/cards/search-filters";
import {
  facetFields,
  mergeSearchCriteria,
  parseSearchSyntax,
  withFieldAliases,
  type ParsedSearch,
  type SearchField,
} from "@/lib/cards/search-syntax";

/**
 * Recherche dans un catalogue de produits : la même syntaxe que la galerie de
 * cartes (`faction:Rebelles points<=8 commando`), portée sur les attributs que
 * les produits d'un jeu déclarent vraiment.
 *
 * Tout est repris de la recherche de cartes — le découpage de la saisie, les
 * suggestions, la fusion avec les filtres de la barre latérale. Deux choses
 * seulement changent, et elles sont ici :
 *
 *  - le vocabulaire commun n'est pas le même. Un produit n'a ni langue ni type
 *    de carte : il a une gamme (`set`) et une forme (`kind`) ;
 *  - les critères se traduisent en filtre **Mongo**, et non en expression
 *    Meilisearch : le catalogue de produits n'est pas indexé.
 */

/** Une facette de produit a la même forme que celle d'une carte : rien ne la distingue. */
export type ProductFacet = CardFilterFacet;

/**
 * Le vocabulaire de la saisie pour un jeu : ses attributs, plus `set` et `kind`.
 *
 * `kind` prend la place que `type` occupe pour une carte — c'est le même rôle,
 * une famille de valeurs closes qui n'est pas un attribut du jeu.
 */
export function buildProductSearchFields(
  facets: ProductFacet[],
  { setCodes = [], kinds = PRODUCT_KIND_KEYS as readonly string[] }: { setCodes?: string[]; kinds?: readonly string[] } = {}
): SearchField[] {
  return withFieldAliases([
    ...facetFields(facets),
    { key: "set", kind: "set", values: [...setCodes] },
    { key: "kind", kind: "type", values: [...kinds] },
  ]);
}

export type ProductQuery = {
  /** Ce qu'il reste de la saisie une fois les tokens retirés : le nom cherché. */
  search?: string;
  setCode?: string;
  kind?: string;
  criteria: CardSearchCriteria;
  /** La lecture de la saisie, pour signaler ce qui n'a pas été compris. */
  parsed: ParsedSearch;
};

/**
 * Ce que la requête demande vraiment, saisie et paramètres réunis.
 *
 * Un token de la barre l'emporte sur la liste déroulante correspondante :
 * taper `set:LEG` filtre la gamme même si la liste dit « toutes », comme dans la
 * galerie de cartes. Les critères d'attributs, eux, se cumulent — la barre
 * latérale et la saisie décrivent le même filtre à deux endroits.
 */
export function parseProductQuery({
  search,
  setCode,
  kind,
  criteria = EMPTY_CRITERIA,
  facets,
  setCodes = [],
}: {
  search?: string;
  setCode?: string;
  kind?: string;
  criteria?: CardSearchCriteria;
  facets: ProductFacet[];
  setCodes?: string[];
}): ProductQuery {
  const parsed = parseSearchSyntax(search ?? "", buildProductSearchFields(facets, { setCodes }));
  const text = parsed.text.trim();

  return {
    search: text || undefined,
    setCode: parsed.setCode ?? setCode,
    // `parsed.type` porte la forme du produit : c'est le champ `kind` de la
    // saisie, rangé par la syntaxe dans la case qu'elle appelle « type ».
    kind: parsed.type ?? kind,
    criteria: mergeSearchCriteria(criteria, parsed.criteria),
    parsed,
  };
}

/** Chemin d'un attribut dans le document produit. */
function attributePath(key: string): string {
  return `attributes.${key}`;
}

/**
 * Filtre Mongo des critères d'attributs.
 *
 * Rien n'est construit à partir de ce que l'appelant envoie : une clé qui n'est
 * pas une facette du jeu est ignorée, et une valeur que la facette ne déclare
 * pas ne descend pas jusqu'à la requête. Les critères arrivent déjà tamisés par
 * `parseCardSearchCriteria`, mais cette fonction sert aussi la saisie et les
 * appels d'agents : elle refait le tri plutôt que de le supposer fait.
 */
export function productFacetMatch(
  criteria: CardSearchCriteria,
  facets: ProductFacet[]
): Record<string, unknown> {
  const numbers = new Map(facets.flatMap((facet) => (facet.type === "number" ? [[facet.key, facet]] : [])));
  const lists = new Map(facets.flatMap((facet) => (facet.type === "value" ? [[facet.key, facet]] : [])));

  const match: Record<string, unknown> = {};

  for (const [key, range] of Object.entries(criteria.ranges)) {
    if (!numbers.has(key)) continue;

    const bounds = {
      ...(range.min !== undefined ? { $gte: range.min } : {}),
      ...(range.max !== undefined ? { $lte: range.max } : {}),
    };
    if (Object.keys(bounds).length > 0) {
      match[attributePath(key)] = bounds;
    }
  }

  for (const [key, values] of Object.entries(criteria.values)) {
    const facet = lists.get(key);
    if (!facet) continue;

    const kept = values.filter((value) => facet.values.includes(value));
    // `$in` retrouve aussi bien une valeur seule qu'une valeur au sein d'une
    // liste : un attribut à valeurs multiples se filtre sans cas particulier.
    if (kept.length > 0) {
      match[attributePath(key)] = { $in: kept };
    }
  }

  return match;
}
