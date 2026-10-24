import type { CardAttributeValue } from "@/lib/db/cards";
import { searchDocumentId } from "@/lib/cards/import-search";
import { searchableTranslations, type CardTranslations } from "@/lib/cards/translations";
import { withUniquePrintingIds } from "@/lib/constants/card-ids";
import type { CardIndexConfig } from "@/lib/meilisearch";

/**
 * Le minimum dont on a besoin pour construire un document de recherche. Aussi
 * bien une carte validée par le formulaire qu'une carte relue en base s'y
 * conforment : les deux chemins produisent donc exactement le même document.
 */
type SearchableCard = {
  id: string;
  name: string;
  setCode?: string;
  collectorNumber?: string;
  lang?: string;
  image?: string;
  text?: string;
  foil?: boolean;
  printings?: { id?: string; name: string; foil?: boolean; image?: string; setCode?: string; collectorNumber?: string }[];
  translations?: CardTranslations;
  attributes?: Record<string, CardAttributeValue>;
};

export function toSearchDocument(
  indexConfig: CardIndexConfig,
  card: SearchableCard
): Record<string, unknown> {
  return {
    ...card.attributes,
    id: searchDocumentId(card.id),
    cardId: card.id,
    name: card.name,
    lang: card.lang,
    image: card.image || undefined,
    text: card.text || undefined,
    foil: card.foil || undefined,
    // Les variantes ne sont saisies que par ce formulaire, qui réindexe la
    // carte : la recherche est donc une source fiable pour les écrans qui
    // ajoutent un exemplaire depuis un résultat de recherche.
    printings: card.printings?.length ? withUniquePrintingIds(card.printings) : undefined,
    // Les noms et textes traduits : la recherche et le scanner trouvent aussi
    // une carte par son nom français.
    translations: searchableTranslations(card.translations),
    // Écrits seulement s'ils sont renseignés : l'index peut les porter sous un
    // autre nom que la base (`set` chez Magic), qui est alors relu comme un
    // attribut de jeu — le mapper à `undefined` l'effacerait du document.
    ...(card.setCode !== undefined && { [indexConfig.keys.set]: card.setCode }),
    ...(card.collectorNumber !== undefined && {
      [indexConfig.keys.collectorNumber]: card.collectorNumber,
    }),
  };
}
