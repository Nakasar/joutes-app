import type { Game } from "@/lib/types/Game";
import { collectionLanguage, type CollectionLanguage } from "@/lib/schemas/collection.schema";

/**
 * Langues dans lesquelles les cartes d'un jeu sont imprimées.
 *
 * Deux écritures d'une même langue cohabitent dans l'application : le
 * catalogue range ses cartes sous `lang: "fr"` (minuscules), la collection note
 * la langue d'un exemplaire en `language: "FR"` (l'énumération
 * `collectionLanguage`). La liste ci-dessous est celle de la collection, en
 * minuscules : un jeu ne peut déclarer qu'une langue qu'un exemplaire peut
 * porter, de sorte que les deux restent alignées.
 *
 * Une langue déclarée n'a pas besoin d'exister au catalogue : un jeu dont on
 * n'a importé que l'anglais peut proposer le français, et la recherche retombe
 * alors sur les cartes anglaises (cf. `catalogLanguagesForSearch`).
 */
export const CARD_LANGUAGES = collectionLanguage.options.map(
  (code) => code.toLowerCase() as Lowercase<CollectionLanguage>,
);

export type CardLanguage = (typeof CARD_LANGUAGES)[number];

/** Langues proposées par un jeu qui n'en déclare aucune et dont le catalogue est vide. */
const FALLBACK_LANGUAGES: readonly CardLanguage[] = ["fr", "en"];

export function isCardLanguage(value: unknown): value is CardLanguage {
  return typeof value === "string" && (CARD_LANGUAGES as readonly string[]).includes(value);
}

/** `"fr"` → `"FR"`, la valeur que porte un exemplaire de collection ; `undefined` pour une langue inconnue. */
export function toCollectionLanguage(code: string | undefined): CollectionLanguage | undefined {
  const upper = code?.trim().toUpperCase();
  return collectionLanguage.safeParse(upper).success ? (upper as CollectionLanguage) : undefined;
}

type LanguagesSource = Pick<Game, "languages"> | null | undefined;

/**
 * Les langues proposées pour un jeu, dans l'ordre d'affichage.
 *
 * La liste réglée depuis l'administration fait foi. Sans elle, le jeu propose
 * les langues présentes au catalogue (`catalogLanguages`, un `distinct("lang")`
 * sur ses cartes), et à défaut français et anglais : c'est ce que faisaient
 * les écrans avant que la liste soit réglable.
 */
export function getGameLanguages(game: LanguagesSource, catalogLanguages: readonly unknown[] = []): string[] {
  if (game?.languages !== undefined) {
    return [...game.languages];
  }

  const fromCatalog = [
    ...new Set(
      catalogLanguages.filter((value): value is string => typeof value === "string" && value.length > 0),
    ),
  ].sort();

  return fromCatalog.length > 0 ? fromCatalog : [...FALLBACK_LANGUAGES];
}

/**
 * Les valeurs de `lang` du catalogue qui servent une recherche dans la langue
 * `requested` (celle d'un booster, d'une carte scannée…), ou `null` pour ne pas
 * filtrer.
 *
 * La langue demandée est celle des cartes physiques, pas celle des fiches : une
 * fiche du catalogue vaut pour toutes les impressions de la carte, et
 * l'exemplaire ajouté à la collection porte la langue demandée. On prend donc
 * la langue demandée et l'anglais, langue de référence de la plupart des
 * imports. Si aucune des deux n'existe au catalogue (un jeu importé en
 * français seulement, où l'on cherche une carte anglaise), on retombe sur une
 * seule de ses langues, la première dans l'ordre alphabétique : une carte
 * importée en plusieurs langues n'apparaît ainsi qu'une fois.
 */
export function catalogLanguagesForSearch(requested: string, catalogLanguages: readonly unknown[]): string[] | null {
  if (!requested || requested === "all") {
    return null;
  }

  const accepted = requested === "en" ? ["en"] : ["en", requested];
  const catalog = catalogLanguages
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort();
  if (catalog.length === 0 || accepted.some((lang) => catalog.includes(lang))) {
    return accepted;
  }
  return [catalog[0]];
}
