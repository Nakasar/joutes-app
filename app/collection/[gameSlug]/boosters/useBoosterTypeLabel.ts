"use client";

import { useTranslations } from "next-intl";
import { KNOWN_BOOSTER_TYPES, normalizeBoosterType } from "@/lib/constants/booster-types";

/**
 * Libellé d'un type de booster : traduit quand le type fait partie de ceux
 * proposés par l'application, affiché tel quel sinon (valeur saisie via l'API
 * ou type retiré de la liste d'un jeu depuis).
 */
export function useBoosterTypeLabel() {
  const t = useTranslations("Collection");

  return (type?: string) => {
    const normalized = normalizeBoosterType(type);
    return KNOWN_BOOSTER_TYPES.includes(normalized) ? t(`boosters.types.${normalized}`) : normalized;
  };
}
