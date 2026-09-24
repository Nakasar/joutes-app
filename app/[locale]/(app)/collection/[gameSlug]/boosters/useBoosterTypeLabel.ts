"use client";

import { useTranslations } from "next-intl";
import { KNOWN_BOOSTER_TYPES, normalizeBoosterType } from "@/lib/constants/booster-types.ts";

/**
 * Libellé d'un type de booster : celui saisi dans l'administration du jeu s'il
 * y en a un, la traduction quand le type fait partie de ceux connus de
 * l'application, la valeur telle quelle sinon (valeur saisie via l'API ou type
 * retiré de la liste d'un jeu depuis).
 */
export function useBoosterTypeLabel(customLabels: Record<string, string> = {}) {
  const t = useTranslations("Collection");

  return (type?: string) => {
    const normalized = normalizeBoosterType(type);
    if (customLabels[normalized]) {
      return customLabels[normalized];
    }
    return KNOWN_BOOSTER_TYPES.includes(normalized) ? t(`boosters.types.${normalized}`) : normalized;
  };
}
