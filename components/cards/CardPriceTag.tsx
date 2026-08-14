"use client";

import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { formatCardPrice, type CardMarketPrice } from "@/lib/prices/display";

/**
 * Prix d'une carte, en petit, à côté de son nom.
 *
 * Le même composant sert la galerie, la collection et les boosters : un prix
 * doit se lire pareil partout, et se reconnaître d'un coup d'œil comme une
 * indication de marché plutôt que comme une valeur de la carte elle-même.
 * D'où l'infobulle, qui dit d'où il vient et de quand il date — cf.
 * docs/CARD_PRICES.md.
 *
 * Sans relevé, le composant ne rend rien : une place vide vaut mieux qu'un
 * tiret que l'on prendrait pour un prix nul.
 */
export function CardPriceTag({ price, className = "" }: { price?: CardMarketPrice; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  if (!price) {
    return null;
  }

  const amount = formatCardPrice(price, locale);
  const updatedAt = DateTime.fromISO(price.updatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED);

  return (
    <span
      className={`shrink-0 whitespace-nowrap font-medium tabular-nums text-emerald-700 dark:text-emerald-400 ${className}`}
      title={t("tooltip", { date: updatedAt })}
    >
      {amount}
      <span className="sr-only"> — {t("tooltip", { date: updatedAt })}</span>
    </span>
  );
}
