"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { BuildProps } from "@/components/play/limited/kit";
import {
  CardZoom,
  CostCurve,
  DeckProblems,
  DeckRow,
  Dot,
  LimitedCard,
  SeatStrip,
  Slot,
} from "@/components/play/limited/limited-kit";
import { COLOR_HEX, type CpTableCard, type CpTableCards } from "@/lib/engine/cyberpunk/cards";
import {
  addToCpDeck,
  CP_COLORS,
  CP_MAX_COLORS,
  CP_MAX_LEGENDS,
  cpCostCurve,
  cpDeckColors,
  cpLimitedRules,
  isLegendTaken,
  isOffColor,
  leftInCpPool,
  removeFromCpDeck,
} from "@/lib/engine/cyberpunk/limited";
import type { CpColor, CpDeckList, CpKind } from "@/lib/engine/cyberpunk/types";
import { stacks, type Pulled } from "@/lib/engine/limited";
import { cn } from "@/lib/utils";

type KindFilter = "all" | CpKind;
const KIND_FILTERS: KindFilter[] = ["all", "unit", "gear", "program", "legend"];
const KIND_ORDER: CpKind[] = ["legend", "unit", "gear", "program"];

function matchesKind(card: CpTableCard | undefined, filter: KindFilter): boolean {
  return filter === "all" || !card || card.kind === filter;
}

/**
 * La construction d'un deck de scellé de Cyberpunk TCG (Tournament Rules,
 * annexe D.2.2) : trois Légendes au plus, de noms différents, et trente cartes
 * au moins de trois couleurs au plus, sans limite de RAM ni d'exemplaires. Un
 * clic sur une carte de la réserve l'ajoute, un clic dans le deck la retire. Le
 * moteur dit ce qui manque (`problems`) ; rien n'est jugé ici.
 */
export function CpBuildScreen({ view, seat, cards, faces, deck, problems, onDeck }: BuildProps<CpDeckList, CpTableCards>) {
  const t = useTranslations("Games.Limited");
  const [colors, setColors] = useState<CpColor[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [zoom, setZoom] = useState<Pulled | null>(null);

  const pool = useMemo(() => view.you?.pool ?? [], [view.you?.pool]);
  const rules = cpLimitedRules();
  const played = cpDeckColors(deck, cards);
  const commit = (next: CpDeckList) => onDeck(next, false);

  const left = useMemo(() => {
    const order = (card: Pulled) => {
      const found = cards[card.code];
      return [
        found ? KIND_ORDER.indexOf(found.kind) : KIND_ORDER.length,
        found ? CP_COLORS.indexOf(found.color) : CP_COLORS.length,
        found?.cost ?? 0,
      ] as const;
    };
    return stacks(
      leftInCpPool(pool, deck)
        .map((card, index) => ({ card, index, key: order(card) }))
        .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index)
        .map(({ card }) => card),
    );
  }, [pool, deck, cards]);
  const shown = left.filter((stack) => {
    const card = cards[stack.code];
    return matchesKind(card, kind) && (colors.length === 0 || (card !== undefined && colors.includes(card.color)));
  });

  const mainStacks = stacks(
    [...deck.cards]
      .sort((a, b) => (cards[a]?.cost ?? 0) - (cards[b]?.cost ?? 0) || faces.name(a).localeCompare(faces.name(b)))
      .map((code) => ({ code })),
  );
  const missing = CP_MAX_LEGENDS - deck.legends.length;

  return (
    <div className="flex flex-col gap-4">
      <SeatStrip view={view} seat={seat} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5">
          <div className="flex flex-row flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">
              {t("build.pool", { count: left.reduce((sum, stack) => sum + stack.count, 0) })}
            </h2>
            <div
              className="inline-flex flex-wrap overflow-hidden rounded-lg border"
              role="group"
              aria-label={t("build.kindFilter")}
            >
              {KIND_FILTERS.map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={kind === value}
                  onClick={() => setKind(value)}
                  className={cn(
                    "min-h-9 px-3 text-xs transition",
                    kind === value ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(`cp.build.kind.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-row flex-wrap gap-2" role="group" aria-label={t("cp.build.colorFilter")}>
            {CP_COLORS.map((color) => {
              const on = colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setColors(on ? colors.filter((value) => value !== color) : [...colors, color])}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition",
                    on ? "border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Dot color={COLOR_HEX[color]} />
                  {t(`cp.color.${color}`)}
                </button>
              );
            })}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              {t("build.poolEmpty")}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-7">
              {shown.map((stack) => {
                const card = cards[stack.code];
                const name = faces.name(stack.code);
                // Une carte que le deck ne peut pas recevoir : le moteur la refuserait.
                const taken = isLegendTaken(card, deck, cards);
                const off = isOffColor(card, played);
                return (
                  <LimitedCard
                    key={stack.code}
                    code={stack.code}
                    foil={stack.foil}
                    count={stack.count}
                    faces={faces}
                    dim={taken || off}
                    note={
                      taken
                        ? t(deck.legends.length >= CP_MAX_LEGENDS ? "cp.build.legendFull" : "cp.build.legendTwin")
                        : off
                          ? t("cp.build.offColor")
                          : undefined
                    }
                    label={card?.kind === "legend" ? t("cp.build.chooseLegend", { name }) : t("build.add", { name })}
                    onClick={card && !taken ? () => commit(addToCpDeck(deck, card)) : undefined}
                    onInspect={() => setZoom({ code: stack.code, foil: stack.foil })}
                  />
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("cp.build.hint")}</p>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("build.deck")}</h2>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {played.map((color) => (
                  <Dot key={color} color={COLOR_HEX[color]} />
                ))}
                {t("cp.build.colors", { count: played.length, max: CP_MAX_COLORS })}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("cp.build.legends")}
                <span className="text-sm normal-case text-foreground">
                  {t("cp.build.legendCount", { count: deck.legends.length, max: CP_MAX_LEGENDS })}
                </span>
              </span>
              {deck.legends.map((code) => (
                <Slot
                  key={code}
                  name={faces.name(code)}
                  empty={false}
                  onInspect={() => setZoom({ code })}
                  onRemove={() => commit(removeFromCpDeck(deck, code))}
                  removeLabel={t("build.remove", { name: faces.name(code) })}
                />
              ))}
              {Array.from({ length: missing }, (_, index) => (
                <Slot key={index} name={t("cp.build.blankEddie")} empty removeLabel="" />
              ))}
              {missing > 0 && <span className="text-xs text-muted-foreground">{t("cp.build.legendHint")}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("cp.build.main")}
                <span
                  className={cn(
                    "text-sm normal-case",
                    deck.cards.length >= rules.minMain ? "text-emerald-500" : "text-foreground",
                  )}
                >
                  {t("build.mainCount", { count: deck.cards.length, min: rules.minMain })}
                </span>
              </span>
              {deck.cards.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("build.mainEmpty")}</p>
              ) : (
                <ul className="flex max-h-80 flex-col overflow-y-auto text-sm">
                  {mainStacks.map((stack) => (
                    <DeckRow
                      key={stack.code}
                      code={stack.code}
                      count={stack.count}
                      faces={faces}
                      name={faces.name(stack.code)}
                      removeLabel={t("build.remove", { name: faces.name(stack.code) })}
                      onRemove={() => commit(removeFromCpDeck(deck, stack.code))}
                      onInspect={() => setZoom({ code: stack.code })}
                    />
                  ))}
                </ul>
              )}
              <CostCurve curve={cpCostCurve(deck, cards)} className="mt-2" />
            </div>
          </section>

          <DeckProblems problems={problems} />
        </aside>
      </div>
      <CardZoom code={zoom?.code ?? null} foil={zoom?.foil} faces={faces} onClose={() => setZoom(null)} />
    </div>
  );
}
