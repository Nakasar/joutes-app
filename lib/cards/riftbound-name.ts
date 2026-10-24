/**
 * Nom complet d'une carte Riftbound, tel que l'écrivent les listes de deck et
 * Cardmarket (`Kai'Sa, Survivor`), à partir de la galerie officielle.
 *
 * La galerie ne publie plus ce nom d'un seul tenant : depuis l'extension
 * Radiance, `name` ne porte que le personnage (`Kai'Sa`) et le titre est passé
 * dans un champ à part, `subtitle`. Ce champ ne sert pas qu'aux champions :
 * - unité championne : le titre de la carte (`Survivor`), à recoller au nom ;
 * - sort ou unité « signature » : le champion auquel la carte est liée
 *   (`Icathian Rain` → `Kai'Sa`), qui ne fait pas partie du nom ;
 * - légende de deck de démarrage : `Starter`, qui n'en fait pas partie non plus.
 *
 * Les légendes, elles, n'ont jamais eu le nom du champion dans `name`
 * (`Bashful Bloom`) : il vient de leur première étiquette (`Lillia`).
 */

export type RiftboundGalleryCard = {
  name: string;
  subtitle?: string | null;
  cardType?: {
    type?: { label?: string }[];
    superType?: { label?: string }[];
  };
  tags?: { tags?: string[] };
};

const has = (values: { label?: string }[] | undefined, label: string) =>
  values?.some((value) => value.label === label) ?? false;

export function riftboundCardName(card: RiftboundGalleryCard): string {
  const name = card.name.trim();
  const subtitle = card.subtitle?.trim();
  const types = card.cardType?.type;

  if (types?.[0]?.label === "Legend") {
    const champion = card.tags?.tags?.[0]?.trim();
    return champion ? `${champion}, ${name}` : name;
  }

  const isChampionUnit = has(types, "Unit") && has(card.cardType?.superType, "Champion");
  // Un `name` déjà complet (ancienne forme de la galerie) n'est pas doublé.
  if (isChampionUnit && subtitle && !name.endsWith(`, ${subtitle}`)) {
    return `${name}, ${subtitle}`;
  }

  return name;
}
