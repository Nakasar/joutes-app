"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";

import { CardZoom, cardName, DomainCounts, isMainCard, LimitedCard, SeatStrip } from "@/components/play/limited/limited-kit";
import { Button } from "@/components/ui/button";
import type { TableCards } from "@/lib/engine/cards";
import { domainCounts, sortPack, type LimitedView, type Pulled } from "@/lib/engine/limited";
import { cn } from "@/lib/utils";

/**
 * L'ouverture d'un scellé : les boosters se regardent un par un. Le moteur les
 * a tous ouverts à la création ; `opened` dit seulement combien on en a vu.
 */
export function SealedOpening({
  view,
  seat,
  cards,
  opened,
  onOpened,
}: {
  view: LimitedView;
  seat: number;
  cards: TableCards;
  opened: number;
  onOpened: (opened: number) => void;
}) {
  const t = useTranslations("Games.Limited");
  const [zoom, setZoom] = useState<Pulled | null>(null);
  const pool = view.you?.pool ?? [];
  const boosters = view.packs.length;
  const size = boosters > 0 ? Math.floor(pool.length / boosters) : 0;
  const current = Math.min(opened, boosters - 1);
  const pack = pool.slice(current * size, (current + 1) * size);
  const seen = pool.slice(0, (current + 1) * size);
  const last = current >= boosters - 1;
  const rares = seen.filter((card) => {
    const rarity = cards[card.code]?.rarity;
    return rarity === "rare" || rarity === "epic";
  }).length;

  return (
    <div className="flex flex-col gap-4">
      <SeatStrip view={view} seat={seat} />
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <ol className="flex flex-row flex-wrap gap-2 text-sm">
          {view.packs.map((set, index) => (
            <li
              key={index}
              aria-current={index === current ? "step" : undefined}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-1.5",
                index === current && "border-primary bg-primary/10 font-semibold",
                index > current && "text-muted-foreground",
              )}
            >
              {index < current && <Check className="size-3.5 text-emerald-500" aria-hidden />}
              {t("sealed.booster", { number: index + 1, set })}
            </li>
          ))}
        </ol>
        <div className="flex flex-row flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            {t("sealed.title", { number: current + 1, boosters, set: view.packs[current] ?? "" })}
          </h2>
          <div className="flex flex-row flex-wrap gap-2">
            {!last && (
              <Button variant="outline" onClick={() => onOpened(boosters)}>
                {t("sealed.skip")}
              </Button>
            )}
            <Button onClick={() => onOpened(last ? boosters : current + 1)}>
              {t(last ? "sealed.build" : "sealed.next")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 xl:grid-cols-7">
          {sortPack(pack, cards, "rarity").map((card, index) => (
            <LimitedCard
              key={`${current}-${index}`}
              code={card.code}
              foil={card.foil}
              cards={cards}
              showRarity
              label={t("inspect", { name: cardName(card.code, cards, t) })}
              onClick={() => setZoom(card)}
            />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
        <h2 className="font-semibold">{t("sealed.poolTitle", { count: seen.length, total: pool.length })}</h2>
        <DomainCounts
          counts={domainCounts(
            seen.map((card) => card.code).filter((code) => isMainCard(cards[code])),
            cards,
          )}
        />
        <p className="text-sm text-muted-foreground">{t("sealed.rares", { count: rares })}</p>
      </section>
      <CardZoom code={zoom?.code ?? null} foil={zoom?.foil} cards={cards} onClose={() => setZoom(null)} />
    </div>
  );
}
