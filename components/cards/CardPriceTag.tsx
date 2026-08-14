"use client";

import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ExternalLink } from "lucide-react";
import { formatCardPrice, type CardMarketPrice } from "@/lib/prices/display";
import { cardmarketProductUrl } from "@/lib/prices/cardmarket";

/**
 * Prix d'une carte, en petit, à côté de son nom.
 *
 * Le même composant sert la galerie, la collection, les boosters et les
 * échanges : un prix doit se lire pareil partout, et se reconnaître d'un coup
 * d'œil comme une indication de marché plutôt que comme une valeur de la carte
 * elle-même. D'où l'infobulle, qui dit d'où il vient et de quand il date — cf.
 * docs/CARD_PRICES.md.
 *
 * `gameSlug` ouvre le prix sur la fiche Cardmarket du produit. Il n'est fourni
 * que là où le prix n'est pas déjà à l'intérieur d'un lien ou d'un bouton :
 * une ancre imbriquée dans une autre n'est pas du HTML valide, et la tuile
 * d'une galerie ou d'une collection est elle-même cliquable.
 *
 * Sans relevé, le composant ne rend rien : une place vide vaut mieux qu'un
 * tiret que l'on prendrait pour un prix nul.
 */
export function CardPriceTag({
  price,
  gameSlug,
  className = "",
}: {
  price?: CardMarketPrice;
  gameSlug?: string;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  if (!price) {
    return null;
  }

  const amount = formatCardPrice(price, locale);
  const updatedAt = DateTime.fromISO(price.updatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED);
  const url = cardmarketProductUrl(gameSlug, price.productId);
  const style = `shrink-0 whitespace-nowrap font-medium tabular-nums text-emerald-700 dark:text-emerald-400 ${className}`;

  if (!url) {
    return (
      <span className={style} title={t("tooltip", { date: updatedAt })}>
        {amount}
        <span className="sr-only"> — {t("tooltip", { date: updatedAt })}</span>
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`${style} inline-flex items-center gap-0.5 hover:underline`}
      title={t("openOnCardmarket", { date: updatedAt })}
    >
      {amount}
      <ExternalLink className="size-2.5" aria-hidden="true" />
      <span className="sr-only"> — {t("openOnCardmarket", { date: updatedAt })}</span>
    </a>
  );
}
