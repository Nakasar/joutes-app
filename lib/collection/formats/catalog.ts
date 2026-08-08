import type { CatalogCard } from "./types";

/**
 * Retrouver une carte à partir d'un fichier tiers : les codes d'extension y
 * sont écrits dans une casse quelconque et les numéros de collection tantôt
 * complétés de zéros (`OGN-001`), tantôt non (`SFD125`). On compare donc sur
 * une forme normalisée plutôt que caractère pour caractère.
 */
export function normalizeCollectorNumber(value: string): string {
  const trimmed = value.trim().toUpperCase();
  // Seuls les zéros de tête d'un numéro sont retirés : « 001 » et « 1 »
  // désignent la même carte, « 001A » et « 1A » aussi, mais « S01 » reste tel
  // quel — son zéro fait partie du numéro.
  return trimmed.replace(/^0+(?=\d)/, "");
}

function printingKey(setCode: string, collectorNumber: string): string {
  return `${setCode.trim().toUpperCase()}|${normalizeCollectorNumber(collectorNumber)}`;
}

export type CatalogIndex = {
  /** Carte par identifiant exact du catalogue. */
  byId(id: string): CatalogCard | undefined;
  /** Carte par extension et numéro de collection, normalisés. */
  byPrinting(setCode: string, collectorNumber: string): CatalogCard | undefined;
  /** Tirages portant ce nom, tous sets confondus. */
  byName(name: string): CatalogCard[];
};

/** Index de recherche sur le catalogue d'un jeu, construit une fois par import. */
export function createCatalogIndex(catalog: CatalogCard[]): CatalogIndex {
  const ids = new Map<string, CatalogCard>();
  const printings = new Map<string, CatalogCard>();
  const names = new Map<string, CatalogCard[]>();

  for (const card of catalog) {
    // Premier arrivé, premier servi : `cards.id` n'est pas strictement unique
    // (quelques jetons et promos partagent un identifiant), et rien ne permet
    // de départager — mieux vaut un choix stable qu'un choix arbitraire.
    if (!ids.has(card.id)) ids.set(card.id, card);

    const key = printingKey(card.setCode, card.collectorNumber);
    if (!printings.has(key)) printings.set(key, card);

    const nameKey = card.name.trim().toLowerCase();
    const list = names.get(nameKey) ?? [];
    list.push(card);
    names.set(nameKey, list);
  }

  return {
    byId: (id) => ids.get(id.trim()),
    byPrinting: (setCode, collectorNumber) =>
      setCode.trim() && collectorNumber.trim()
        ? printings.get(printingKey(setCode, collectorNumber))
        : undefined,
    byName: (name) => names.get(name.trim().toLowerCase()) ?? [],
  };
}
