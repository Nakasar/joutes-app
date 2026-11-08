import type { CardFilterFacet } from "@/lib/cards/search-filters";
import { parseSearchSyntax, type SearchField } from "@/lib/cards/search-syntax";
import { bareCollectorNumber, collectorNumberVariants, parseCardSearch } from "@/lib/cards/search-query";
import { buildCollectionQuery } from "@/lib/collection/query";

/**
 * Syntaxe de recherche de cartes dans la recherche globale du site.
 *
 * La palette cherche dans tous les jeux à la fois, alors que le vocabulaire
 * (`domain:fury`, `energy<=3`, `set:UNL`) dépend de chaque jeu. La saisie est
 * donc lue une fois par jeu, avec ses facettes, puis traduite en filtre Mongo
 * comme le fait la collection. S'y ajoutent les raccourcis des éditeurs de
 * booster : `e:UNL`, `cn:012` et un numéro tapé seul.
 */

/** Vaut-il la peine de charger le vocabulaire des jeux pour cette saisie ? */
export function mayUseCardSyntax(query: string): boolean {
  return /[:<>=]/.test(query) || bareCollectorNumber(query) !== null;
}

/**
 * Le filtre Mongo des cartes d'un jeu pour une saisie à syntaxe, ou `null`
 * quand la saisie ne s'applique pas à ce jeu : rien de reconnu (c'est alors une
 * recherche par nom ordinaire), ou un filtre que ce jeu ne connaît pas
 * (`set:UNL` pour un jeu sans cette extension). Ignorer ce dernier rendrait
 * tout le catalogue du jeu.
 */
export function cardSyntaxMatch(
  query: string,
  fields: SearchField[],
  facets: CardFilterFacet[]
): Record<string, unknown> | null {
  const parsed = parseSearchSyntax(query, fields);
  if (parsed.rejected.length > 0) return null;

  // Ce qui reste passe par le lecteur des éditeurs de booster : `e:`, `cn:`,
  // `lang:` et le numéro seul.
  const legacy = parseCardSearch(parsed.text);
  if (parsed.tokens.length === 0 && !legacy.setCode && !legacy.cn && !legacy.lang) return null;

  let setCode = parsed.setCode;
  if (!setCode && legacy.setCode) {
    const setValues = fields.find((field) => field.kind === "set")?.values ?? [];
    setCode = setValues.find((value) => value.toUpperCase() === legacy.setCode);
    if (!setCode) return null;
  }

  // La langue n'est pas filtrée : la palette propose une carte par nom, quelle
  // que soit la langue de ses fiches.
  const { cardMatch } = buildCollectionQuery({ ...parsed, text: legacy.text, setCode }, facets);
  const clauses: Record<string, unknown>[] = Object.keys(cardMatch).length > 0 ? [cardMatch] : [];

  if (legacy.cn) {
    const numbers: unknown[] = collectorNumberVariants(legacy.cn);
    // Le catalogue porte aussi des numéros stockés en nombre.
    if (/^\d+$/.test(legacy.cn)) numbers.push(Number(legacy.cn));
    clauses.push({ collectorNumber: { $in: numbers } });
  }

  return clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { $and: clauses };
}
