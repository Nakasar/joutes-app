"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { DateTime } from "luxon";
import { Coins, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCardPrice } from "@/lib/prices/display";
import type { CollectionValue } from "@/lib/collection/value";

/**
 * Valeur estimée d'une collection — celle d'un jeu, ou celle de tout le compte
 * — avec le bouton qui la recalcule.
 *
 * Le chiffre est un relevé daté, pas un cours : il ne bouge qu'au clic. C'est
 * ce qui le rend comparable d'un mois à l'autre, et ce qui oblige l'écran à
 * dire de quand il date et sur combien d'exemplaires il repose — une valeur
 * portée par deux cents cartes sur mille ne se lit pas comme le prix de la
 * collection.
 *
 * Sans `recomputePath`, le bloc est en lecture seule : la collection d'un
 * groupe de jeu s'affiche mais ne se recalcule pas depuis cet écran.
 */
export default function CollectionValueSection({
  value,
  copies,
  recomputePath,
  onRecomputed,
}: {
  value?: CollectionValue;
  /** Exemplaires possédés aujourd'hui : ce qui dit si le calcul a vieilli. */
  copies: number;
  /** Route de recalcul (POST). Absente, le bouton n'est pas rendu. */
  recomputePath?: string;
  onRecomputed?: (payload: unknown) => void;
}) {
  const t = useTranslations("Collection.value");
  const locale = useLocale();
  const [computing, setComputing] = useState(false);

  const recompute = async () => {
    if (!recomputePath) return;

    setComputing(true);
    try {
      const res = await fetch(recomputePath, { method: "POST" });
      if (res.ok) {
        onRecomputed?.(await res.json());
      }
    } finally {
      setComputing(false);
    }
  };

  const computedAt = value
    ? DateTime.fromISO(value.computedAt).setLocale(locale).toLocaleString(DateTime.DATE_MED)
    : null;
  // La collection a bougé depuis le calcul : le chiffre parle d'un autre
  // contenu. Mieux vaut l'annoncer que le laisser passer pour celui du jour.
  const outdated = value !== undefined && value.copies !== copies;

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4">
      <Coins className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />

      {/*
        Une largeur plancher plutôt qu'un simple `flex-1` : sur un téléphone,
        l'explication se comprimait en une colonne d'un mot par ligne au lieu
        de laisser le montant et le bouton passer à la ligne suivante.
      */}
      <div className="min-w-[13rem] flex-1">
        <p className="text-sm font-semibold">{t("title")}</p>
        {value ? (
          <p className="text-xs text-muted-foreground">
            {t("breakdown", { priced: value.pricedCopies, copies: value.copies })}
            {computedAt ? ` · ${t("computedAt", { date: computedAt })}` : null}
            {outdated ? (
              <span className="text-amber-600 dark:text-amber-400"> · {t("outdated")}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("never")}</p>
        )}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-3">
        {value ? (
          <span className="shrink-0 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCardPrice({ amount: value.amount, currency: value.currency, updatedAt: value.computedAt }, locale)}
          </span>
        ) : null}

        {recomputePath ? (
          <Button type="button" variant="outline" className="gap-2" onClick={recompute} disabled={computing}>
            {computing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("recompute")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
