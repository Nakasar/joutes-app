import { joutesFormat } from "./joutes";
import { piltoverFormat } from "./piltover";
import type { CollectionFormat } from "./types";

export * from "./types";
export { createCatalogIndex, normalizeCollectorNumber } from "./catalog";

/**
 * Formats d'import/export de collection. Le format « Joutes » est commun à tous
 * les jeux ; les suivants sont propres à un jeu et à l'outil dont ils reprennent
 * le fichier. Ajouter un format pour un jeu, c'est ajouter une entrée ici.
 */
const FORMATS: readonly CollectionFormat[] = [joutesFormat, piltoverFormat];

/** Formats proposés pour un jeu, dans l'ordre d'affichage du sélecteur. */
export function collectionFormatsForGame(gameSlug: string): CollectionFormat[] {
  return FORMATS.filter((format) => !format.gameSlugs || format.gameSlugs.includes(gameSlug));
}

/** Format demandé, s'il existe **et** s'applique à ce jeu. */
export function findCollectionFormat(
  formatId: string,
  gameSlug: string,
): CollectionFormat | undefined {
  return collectionFormatsForGame(gameSlug).find((format) => format.id === formatId);
}

/** Nom du fichier téléchargé : jeu, format et date, pour s'y retrouver dans un dossier de téléchargements. */
export function collectionExportFileName(
  gameSlug: string,
  format: CollectionFormat,
  date: Date,
): string {
  return `${gameSlug}-collection-${format.fileSuffix}-${date.toISOString().slice(0, 10)}.csv`;
}
