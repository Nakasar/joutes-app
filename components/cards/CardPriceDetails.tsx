"use client";

import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { cardPriceAmount, formatCardPrice } from "@/lib/prices/display";
import type { CardPrice } from "@/lib/types/card-price";

/**
 * Le relevé de prix d'une carte, sur sa fiche : le montant de référence, les
 * quelques valeurs qui l'entourent, et d'où il sort.
 *
 * Ailleurs (galerie, collection, booster) un seul chiffre suffit
 * (`CardPriceTag`) ; ici il y a la place de dire ce qu'il vaut vraiment — un
 * prix « à partir de », relevé un jour donné, sur le tirage le moins cher de la
 * carte. Cf. docs/CARD_PRICES.md.
 */
export default function CardPriceDetails({ price }: { price?: CardPrice }) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  const amount = price ? cardPriceAmount(price.prices) : undefined;

  if (!price || amount === undefined) {
    return (
      <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">{t("none")}</p>
    );
  }

  const format = (value: number) => formatCardPrice({ ...price, amount: value }, locale);

  // Les valeurs qui entourent le prix de référence : celles que la place de
  // marché a calculées, et elles seules.
  const figures = [
    { key: "low", value: price.prices.low },
    { key: "trend", value: price.prices.trend },
    { key: "avg30", value: price.prices.avg30 },
  ].filter((figure): figure is { key: string; value: number } => figure.value !== undefined);

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </span>
        <span className="ml-auto text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
          {format(amount)}
        </span>
      </div>

      {figures.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {figures.map((figure) => (
            <div key={figure.key} className="flex items-baseline gap-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{t(`figures.${figure.key}`)}</dt>
              <dd className="text-xs font-medium tabular-nums">{format(figure.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("source", {
          date: DateTime.fromISO(price.sourceUpdatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED),
        })}
        {price.offers.length > 1 ? ` · ${t("printings", { count: price.offers.length })}` : null}
      </p>
    </section>
  );
}
