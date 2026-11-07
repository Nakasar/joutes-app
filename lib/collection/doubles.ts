import type { CollectionEntryGroup } from "@/lib/collection/formats/types";

/** Exemplaires gardés par carte avant de compter des doubles : de quoi jouer la carte. */
export const DEFAULT_KEPT_COPIES = 3;

/**
 * Les doubles d'une collection : ce qui dépasse `keep` exemplaires d'une même
 * carte, pour les proposer à l'échange.
 *
 * Les exemplaires gardés sont les plus ordinaires — non foil, sans variante —,
 * pour que les doubles proposés soient d'abord ceux qu'on a en trop, et pas
 * une version qu'on garderait volontiers.
 */
export function collectionDoubles(
  groups: CollectionEntryGroup[],
  keep: number = DEFAULT_KEPT_COPIES
): CollectionEntryGroup[] {
  const byCard = new Map<string, { group: CollectionEntryGroup; index: number }[]>();
  groups.forEach((group, index) => {
    const list = byCard.get(group.cardId) ?? [];
    list.push({ group, index });
    byCard.set(group.cardId, list);
  });

  const doubles: { group: CollectionEntryGroup; index: number }[] = [];
  for (const list of byCard.values()) {
    const ordered = [...list].sort(
      (a, b) =>
        Number(a.group.foil) - Number(b.group.foil) ||
        Number(Boolean(a.group.printingId)) - Number(Boolean(b.group.printingId))
    );
    let toKeep = Math.max(0, keep);
    for (const { group, index } of ordered) {
      const kept = Math.min(toKeep, group.quantity);
      toKeep -= kept;
      if (group.quantity > kept) doubles.push({ group: { ...group, quantity: group.quantity - kept }, index });
    }
  }

  // L'ordre d'origine (extension, numéro) est celui du fichier exporté.
  return doubles.sort((a, b) => a.index - b.index).map(({ group }) => group);
}
