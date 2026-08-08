import type {
  CardCondition,
  CatalogCard,
  CollectionCurrency,
  CollectionLanguage,
  ImportedEntry,
} from "./types";

/**
 * Lecture des colonnes communes à tous les formats. Une valeur qu'on ne sait
 * pas interpréter est laissée de côté plutôt que devinée : mieux vaut un
 * exemplaire sans langue qu'un exemplaire déclaré en coréen par erreur.
 */

const CONDITIONS: readonly CardCondition[] = ["Damaged", "Played", "Good", "Near Mint", "Mint"];
const LANGUAGES: readonly CollectionLanguage[] = ["FR", "EN", "ZH", "IT", "JA", "KO"];
const CURRENCIES: readonly CollectionCurrency[] = ["EUR", "USD", "GBP", "JPY", "CNY"];

export function parseCondition(value: string): CardCondition | undefined {
  const normalized = value.trim().toLowerCase();
  return CONDITIONS.find((condition) => condition.toLowerCase() === normalized);
}

export function parseLanguageCode(value: string): CollectionLanguage | undefined {
  const normalized = value.trim().toUpperCase();
  return LANGUAGES.find((language) => language === normalized);
}

export function parseCurrency(value: string): CollectionCurrency | undefined {
  const normalized = value.trim().toUpperCase();
  return CURRENCIES.find((currency) => currency === normalized);
}

/** Quantité d'une ligne : au moins 1, et bornée pour qu'une faute de frappe ne crée pas un million de cartes. */
export const MAX_IMPORT_QUANTITY = 999;

export function parseQuantity(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return 1;

  const quantity = Number(trimmed);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_IMPORT_QUANTITY) {
    return null;
  }
  return quantity;
}

export function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "oui";
}

/** Note d'une carte gradée, sur 10. Hors bornes ou illisible : pas de note. */
export function parseGrade(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const grade = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(grade) || grade < 0 || grade > 10) return undefined;
  return grade;
}

export function parsePrice(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const price = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(price) || price < 0) return undefined;
  return price;
}

/** Date au format `yyyy-mm-dd`, seul accepté par le schéma de collection. */
export function parseObtainedAt(value: string): string | undefined {
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

/**
 * Variante d'impression désignée par son identifiant ou son nom. Une carte
 * n'existant qu'en foil impose le foil, quelle que soit la colonne du fichier.
 */
export function matchPrinting(
  card: CatalogCard,
  value: string,
): Pick<ImportedEntry, "printingId" | "printingName"> & { foil?: boolean } {
  const trimmed = value.trim();
  if (!trimmed) return {};

  const printing = (card.printings ?? []).find(
    (candidate) =>
      candidate.id === trimmed || candidate.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (!printing) return {};

  return {
    printingId: printing.id,
    printingName: printing.name,
    ...(printing.foil ? { foil: true } : {}),
  };
}
