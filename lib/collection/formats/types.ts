import type { CardPrinting } from "@/lib/types/card";

// Déduits des énumérations zod, auprès desquelles ils sont désormais déclarés ;
// réexportés ici, où les formats d'import/export les cherchent depuis toujours.
export type {
  CardCondition,
  CollectionLanguage,
  CollectionCurrency,
} from "@/lib/schemas/collection.schema";
import type { CardCondition, CollectionLanguage, CollectionCurrency } from "@/lib/schemas/collection.schema";

/**
 * Un lot d'exemplaires identiques d'une même carte. La collection est stockée
 * un document par exemplaire ; les regrouper ici évite d'écrire mille lignes
 * là où une ligne et une quantité suffisent.
 */
export type CollectionEntryGroup = {
  cardId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  /** Rareté du catalogue, que certains formats reprennent en colonne. */
  rarity?: string;
  foil: boolean;
  printingId?: string;
  printingName?: string;
  language?: CollectionLanguage;
  condition?: CardCondition;
  grade?: number;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CollectionCurrency;
  quantity: number;
};

/** Carte du catalogue d'un jeu, ce sur quoi l'import doit retomber. */
export type CatalogCard = {
  id: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  rarity?: string;
  /** Carte qui n'existe qu'en foil. */
  foil?: boolean;
  printings?: CardPrinting[];
};

/** Ce qu'un format peut consulter du jeu concerné. */
export type FormatContext = {
  gameSlug: string;
  catalog: CatalogCard[];
  /** Nom complet d'un set, par code (« OGN » → « Origins »). */
  setNames: Record<string, string>;
};

/** Un lot d'exemplaires à ajouter, déjà résolu sur le catalogue. */
export type ImportedEntry = {
  card: CatalogCard;
  quantity: number;
  foil: boolean;
  printingId?: string;
  printingName?: string;
  language?: CollectionLanguage;
  condition?: CardCondition;
  grade?: number;
  obtainedAt?: string;
  acquisitionPrice?: number;
  acquisitionCurrency?: CollectionCurrency;
};

/**
 * Ligne écartée. Une ligne illisible ne fait pas échouer tout l'import : elle
 * est signalée avec son numéro, et le reste du fichier est importé — un export
 * tiers contient souvent quelques cartes que le catalogue ne connaît pas.
 */
export type ImportIssue = { line: number; message: string };

export type ImportResult = { entries: ImportedEntry[]; issues: ImportIssue[] };

export interface CollectionFormat {
  id: string;
  /** Libellé affiché dans le sélecteur de format. */
  label: string;
  /**
   * Jeux qui proposent ce format ; absent = tous les jeux. Le format « Joutes »
   * est commun, les autres sont propres à un jeu et à son écosystème d'outils.
   */
  gameSlugs?: readonly string[];
  /** Suffixe du fichier téléchargé, après le jeu et la date. */
  fileSuffix: string;
  toCsv(groups: CollectionEntryGroup[], context: FormatContext): string;
  fromCsv(csv: string, context: FormatContext): ImportResult;
}
