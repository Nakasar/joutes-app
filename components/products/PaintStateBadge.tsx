"use client";

import { useTranslations } from "next-intl";
import type { PaintStateKey } from "@/lib/constants/paint-states";

/**
 * Pastille d'état de peinture. La couleur suit la progression — gris tant que
 * rien n'est fait, ambre pendant le travail, émeraude une fois terminé — pour
 * qu'une vitrine se lise sans avoir à déchiffrer chaque libellé.
 */
const TONES: Record<PaintStateKey, string> = {
  unassembled: "bg-muted text-muted-foreground",
  assembled: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  primed: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  painted: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  based: "bg-emerald-500/25 text-emerald-800 dark:text-emerald-200",
};

export default function PaintStateBadge({
  state,
  sealed,
}: {
  state?: PaintStateKey;
  sealed?: boolean;
}) {
  const t = useTranslations("Collection.products");

  // Un produit scellé n'a pas d'état de peinture qui vaille : ce qu'il faut
  // montrer, c'est qu'il n'a pas encore été ouvert.
  if (sealed) {
    return (
      <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
        {t("copies.sealed")}
      </span>
    );
  }

  if (!state) {
    return null;
  }

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONES[state]}`}>
      {t(`paintStates.${state}`)}
    </span>
  );
}
