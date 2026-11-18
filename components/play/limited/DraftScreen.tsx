"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  CardZoom,
  cardName,
  CostCurve,
  DomainCounts,
  isMainCard,
  LimitedCard,
  SeatStrip,
  useCardLine,
} from "@/components/play/limited/limited-kit";
import { Button } from "@/components/ui/button";
import type { TableCards } from "@/lib/engine/cards";
import {
  costCurve,
  domainCounts,
  limitedRules,
  sortPack,
  stacks,
  type LimitedView,
  type PackSort,
  type Pulled,
} from "@/lib/engine/limited";
import { cn } from "@/lib/utils";

const SORTS: PackSort[] = ["rarity", "domain", "cost"];

/** Le draft : un paquet devant soi, une carte à prendre, le reste passe au voisin. */
export function DraftScreen({
  view,
  seat,
  cards,
  onPick,
}: {
  view: LimitedView;
  seat: number;
  cards: TableCards;
  /** Prend une carte ; rend le refus du moteur, s'il y en a un. */
  onPick: (card: Pulled) => string | null;
}) {
  const t = useTranslations("Games.Limited");
  const line = useCardLine();
  const [sort, setSort] = useState<PackSort>("rarity");
  // La carte regardée, par sa place dans le paquet du moteur.
  const [selected, setSelected] = useState<number | null>(null);
  const [zoom, setZoom] = useState<Pulled | null>(null);

  const pack = view.you?.pack ?? null;
  const pool = view.you?.pool ?? [];
  const size = limitedRules("draft").packSize;
  const chosen = pack && selected !== null ? (pack[selected] ?? null) : null;
  const poolCodes = pool.map((card) => card.code);
  const mainPool = poolCodes.filter((code) => isMainCard(cards[code]));

  const pick = (card: Pulled) => {
    const refused = onPick(card);
    if (refused) toast.error(refused);
    setSelected(null);
    setZoom(null);
  };

  const take = chosen && (
    <Button className="self-start" onClick={() => pick(chosen)}>
      {t("draft.take")}
    </Button>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-4">
        <SeatStrip view={view} seat={seat} />
        <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                {pack
                  ? t("draft.title", {
                      round: view.round + 1,
                      rounds: view.rounds,
                      pick: size - pack.length + 1,
                      size,
                    })
                  : t("draft.titleWaiting", { round: view.round + 1, rounds: view.rounds })}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(view.pass_next ? "draft.passNext" : "draft.passPrevious", { set: view.packs[view.round] ?? "" })}
              </p>
            </div>
            <div className="inline-flex overflow-hidden rounded-lg border" role="group" aria-label={t("draft.sort")}>
              {SORTS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={cn(
                    "min-h-9 px-3 text-xs transition",
                    sort === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`draft.sortBy.${value}`)}
                </button>
              ))}
            </div>
          </div>

          {pack ? (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {sortPack(pack, cards, sort).map((card) => {
                const index = pack.indexOf(card);
                return (
                  <LimitedCard
                    key={index}
                    code={card.code}
                    foil={card.foil}
                    cards={cards}
                    showRarity
                    selected={selected === index}
                    label={t("draft.look", { name: cardName(card.code, cards, t) })}
                    onClick={() => setSelected(index)}
                    onDoubleClick={() => pick(card)}
                    onInspect={() => {
                      setSelected(index);
                      setZoom(card);
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground" role="status">
              {t("draft.waiting")}
            </p>
          )}
          {pack && <p className="text-xs text-muted-foreground">{t("draft.hint")}</p>}
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5" aria-live="polite">
          <h2 className="font-semibold">{t("draft.selected")}</h2>
          {chosen ? (
            <>
              <div className="flex flex-row gap-3">
                <LimitedCard code={chosen.code} foil={chosen.foil} cards={cards} className="w-24 shrink-0" />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">{cardName(chosen.code, cards, t)}</span>
                  <span className="text-xs text-muted-foreground">{line(cards[chosen.code], chosen.foil)}</span>
                </div>
              </div>
              {cards[chosen.code]?.text && (
                <p className="whitespace-pre-line text-sm text-muted-foreground">{cards[chosen.code]?.text}</p>
              )}
              {take}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("draft.none")}</p>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t("draft.picks", { count: pool.length })}</h2>
          {pool.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("draft.noPicks")}</p>
          ) : (
            <>
              <DomainCounts counts={domainCounts(mainPool, cards)} />
              <CostCurve curve={costCurve(mainPool, cards)} />
              <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto text-sm">
                {stacks(pool).map((stack) => (
                  <li key={stack.code}>
                    <button
                      type="button"
                      onClick={() => setZoom({ code: stack.code, foil: stack.foil })}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-secondary"
                    >
                      <span className="w-6 shrink-0 text-muted-foreground">×{stack.count}</span>
                      <span className="truncate">{cardName(stack.code, cards, t)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </aside>

      <CardZoom
        code={zoom?.code ?? null}
        foil={zoom?.foil}
        cards={cards}
        onClose={() => setZoom(null)}
        action={
          zoom && chosen && zoom.code === chosen.code && Boolean(zoom.foil) === Boolean(chosen.foil) ? take : undefined
        }
      />
    </div>
  );
}
