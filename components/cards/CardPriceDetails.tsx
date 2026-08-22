"use client";

import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { ExternalLink } from "lucide-react";
import { cardPriceAmount, formatCardPrice } from "@/lib/prices/display";
import { referenceOffer } from "@/lib/prices/offers";
import { otherCardPrices } from "@/lib/prices/preference";
import { PRICE_SOURCE_LABELS, marketProductUrl } from "@/lib/prices/sources";
import type { CardPrice, CardPriceSource } from "@/lib/types/card-price";
import { Link } from "@/i18n/navigation.ts";
import UsePriceSourceButton from "@/components/cards/UsePriceSourceButton.tsx";

/**
 * Les relevés de prix d'une carte, sur sa fiche : celui qui la représente en
 * grand, ses valeurs, et dessous ce que les autres places de marché en disent.
 *
 * Ailleurs (galerie, collection, booster) un seul chiffre suffit
 * (`CardPriceTag`) ; ici il y a la place de dire ce qu'il vaut vraiment — un
 * prix « à partir de », relevé un jour donné, sur le tirage le moins cher de la
 * carte —, et surtout qu'il en existe un autre. Cf. docs/CARD_PRICES.md.
 *
 * C'est le seul écran qui montre tous les relevés : ailleurs, le prix d'une
 * carte est un chiffre à côté d'un nom, et deux chiffres ne s'y liraient pas.
 * D'où le bouton « Utiliser », qui fait de ce fournisseur celui de toutes les
 * cartes du joueur, partout.
 */
export default function CardPriceDetails({
  prices,
  reference,
  chosenSource,
  gameSlug,
  canChooseSource = false,
}: {
  /** Tous les relevés de la carte, celui qui la représente en tête. */
  prices: CardPrice[];
  /**
   * Le relevé qui représente la carte : le premier fournisseur choisi par le
   * joueur qui la cote. Absent quand aucun ne convient — le fournisseur choisi
   * l'ignore et le repli est coupé.
   */
  reference?: CardPrice;
  /** Le fournisseur que le joueur s'est choisi ; absent, la plateforme choisit. */
  chosenSource?: CardPriceSource;
  gameSlug?: string;
  /** Un visiteur sans compte n'a pas de préférence à enregistrer. */
  canChooseSource?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  const others = otherCardPrices(prices, reference);
  const amount = reference ? cardPriceAmount(reference.prices) : undefined;

  // Aucun relevé du tout : l'écran le dit plutôt que de laisser un vide.
  if (prices.length === 0) {
    return <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">{t("none")}</p>;
  }

  const date = (iso: string) => DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_MED);

  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t("title")}
        </span>
        {reference && amount !== undefined ? (
          <PriceAmount price={reference} amount={amount} gameSlug={gameSlug} />
        ) : null}
      </div>

      {reference && amount !== undefined ? (
        <ReferenceFigures price={reference} gameSlug={gameSlug} />
      ) : (
        /* Pas de tiret à la place du montant : il se lirait comme un prix nul,
           là où c'est le fournisseur choisi qui ne dit rien de cette carte. */
        <p className="text-[11px] leading-snug text-muted-foreground">
          {chosenSource
            ? t("noneFromSource", { market: PRICE_SOURCE_LABELS[chosenSource] })
            : t("none")}
        </p>
      )}

      {others.length > 0 ? (
        <div className="flex flex-col gap-2.5 border-t pt-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("others")}
          </span>
          {others.map((price) => (
            <OtherPrice
              key={price.source}
              price={price}
              gameSlug={gameSlug}
              // Proposer « Utiliser » sur le fournisseur déjà choisi n'aurait
              // rien à changer : c'est le cas quand il ne cote pas la carte.
              canChooseSource={canChooseSource && price.source !== chosenSource}
              formatDate={date}
            />
          ))}
          {/* `Link` de next-intl : le lien garde la langue de la page. */}
          {canChooseSource ? (
            <Link href="/account?tab=profile#prices" className="text-[11px] text-muted-foreground hover:underline">
              {t("settings")}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Le montant de la carte, lié au tirage d'où il sort. */
function PriceAmount({ price, amount, gameSlug }: { price: CardPrice; amount: number; gameSlug?: string }) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  const market = PRICE_SOURCE_LABELS[price.source];
  const sourceDate = DateTime.fromISO(price.sourceUpdatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED);
  // Le lien mène au tirage d'où vient le prix de référence, pas à un autre
  // tirage de la même carte.
  const url = marketProductUrl(price.source, gameSlug, referenceOffer(price.offers)?.productId);
  const formatted = formatCardPrice({ ...price, amount }, locale);

  if (!url) {
    return (
      <span className="ml-auto text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
        {formatted}
      </span>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-auto inline-flex items-center gap-1 text-lg font-bold tabular-nums text-emerald-700 hover:underline dark:text-emerald-400"
      title={t("openOnMarket", { market, date: sourceDate })}
    >
      {formatted}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  );
}

/** Les valeurs qui entourent le prix de référence, et d'où il vient. */
function ReferenceFigures({ price, gameSlug }: { price: CardPrice; gameSlug?: string }) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  const format = (value: number) => formatCardPrice({ ...price, amount: value }, locale);
  const market = PRICE_SOURCE_LABELS[price.source];
  const sourceDate = DateTime.fromISO(price.sourceUpdatedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED);

  // Les valeurs que la place de marché a calculées, et elles seules.
  const figures = [
    { key: "low", value: price.prices.low },
    { key: "trend", value: price.prices.trend },
    { key: "avg30", value: price.prices.avg30 },
  ].filter((figure): figure is { key: string; value: number } => figure.value !== undefined);

  return (
    <>
      {figures.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          {figures.map((figure) => (
            <div key={figure.key} className="flex items-baseline gap-1.5">
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t(`figures.${figure.key}`)}
              </dt>
              <dd className="text-xs font-medium tabular-nums">{format(figure.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-[11px] leading-snug text-muted-foreground">
        {t("source", { market, date: sourceDate })}
        {price.offers.length > 1 ? ` · ${t("printings", { count: price.offers.length })}` : null}
      </p>
    </>
  );
}

/**
 * Un autre relevé de la même carte : son montant, ses valeurs en abrégé, et de
 * quoi en faire sa source.
 *
 * Le montant reste en petit et sans couleur : c'est un point de comparaison,
 * pas le prix de la carte. Deux montants verts de même taille laisseraient le
 * lecteur choisir lequel est le sien.
 */
function OtherPrice({
  price,
  gameSlug,
  canChooseSource,
  formatDate,
}: {
  price: CardPrice;
  gameSlug?: string;
  canChooseSource: boolean;
  formatDate: (iso: string) => string;
}) {
  const locale = useLocale();
  const t = useTranslations("Prices");

  const market = PRICE_SOURCE_LABELS[price.source];
  const amount = cardPriceAmount(price.prices);
  const format = (value: number) => formatCardPrice({ ...price, amount: value }, locale);
  const url = marketProductUrl(price.source, gameSlug, referenceOffer(price.offers)?.productId);

  const figures = [
    price.prices.low === undefined ? undefined : `${t("figures.low").toLowerCase()} ${format(price.prices.low)}`,
    price.prices.trend === undefined ? undefined : `${t("figures.trend").toLowerCase()} ${format(price.prices.trend)}`,
    formatDate(price.sourceUpdatedAt),
  ].filter((figure): figure is string => figure !== undefined);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-semibold">{market}</span>
        {amount === undefined ? (
          // Une place de marché qui suit la carte sans savoir la situer : le
          // dire vaut mieux que de la faire disparaître de la liste.
          <span className="ml-auto text-[11px] text-muted-foreground">{t("noAmount")}</span>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-sm font-semibold tabular-nums hover:underline"
            title={t("openOnMarket", { market, date: formatDate(price.sourceUpdatedAt) })}
          >
            {format(amount)}
            <ExternalLink className="size-2.5" aria-hidden="true" />
          </a>
        ) : (
          <span className="ml-auto text-sm font-semibold tabular-nums">{format(amount)}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{figures.join(" · ")}</p>
        {canChooseSource ? <UsePriceSourceButton source={price.source} market={market} /> : null}
      </div>
    </div>
  );
}
