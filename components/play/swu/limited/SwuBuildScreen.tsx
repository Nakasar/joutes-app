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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { stacks, type Pulled } from "@/lib/engine/limited";
import { ASPECT_HEX, type SwuTableCard, type SwuTableCards } from "@/lib/engine/swu/cards";
import {
  addToSwuDeck,
  isSwuMain,
  leftInSwuPool,
  removeFromSwuDeck,
  SWU_ASPECTS,
  swuAspectPenalty,
  swuBaseChoices,
  swuCostCurve,
  swuDeckAspects,
  swuLimitedRules,
} from "@/lib/engine/swu/limited";
import type { SwuAspect, SwuDeckList } from "@/lib/engine/swu/types";
import { cn } from "@/lib/utils";

type KindFilter = "all" | "unit" | "event" | "upgrade" | "leader";
const KIND_FILTERS: KindFilter[] = ["all", "unit", "event", "upgrade", "leader"];
const NO_BASE = "none";

function matchesKind(card: SwuTableCard | undefined, filter: KindFilter): boolean {
  if (filter === "all" || !card) return true;
  return card.kind === filter;
}

/**
 * La construction d'un deck de Star Wars: Unlimited avec la réserve : un leader
 * de la réserve, une base (ouverte, ou une base commune de l'extension), et
 * trente cartes au moins (règles 10.2.2 et 10.3.4). Un clic sur une carte de la
 * réserve l'ajoute, un clic dans le deck la retire. Le moteur dit ce qui manque
 * (`problems`) ; rien n'est jugé ici.
 */
export function SwuBuildScreen({
  view,
  seat,
  cards,
  faces,
  deck,
  problems,
  onDeck,
}: BuildProps<SwuDeckList, SwuTableCards>) {
  const t = useTranslations("Games.Limited");
  const [aspects, setAspects] = useState<SwuAspect[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [zoom, setZoom] = useState<Pulled | null>(null);

  const pool = useMemo(() => view.you?.pool ?? [], [view.you?.pool]);
  const rules = swuLimitedRules(view.kind);
  const identity = swuDeckAspects(deck, cards);
  const commit = (next: SwuDeckList) => onDeck(next, false);

  const bases = useMemo(() => swuBaseChoices(cards, pool), [cards, pool]);
  const opened = bases.filter((code) => pool.some((card) => card.code === code));
  const common = bases.filter((code) => !opened.includes(code));

  const left = useMemo(() => {
    const order = (card: Pulled) => {
      const found = cards[card.code];
      const aspect = SWU_ASPECTS.findIndex((value) => found?.aspects.includes(value));
      const rank = found?.kind === "leader" ? 0 : isSwuMain(found) ? 1 : 2;
      return [rank, aspect < 0 ? SWU_ASPECTS.length : aspect, found?.cost ?? 0] as const;
    };
    return stacks(
      leftInSwuPool(pool, deck)
        // Les bases se choisissent dans la liste du deck : une base commune n'est pas dans la réserve.
        .filter((card) => cards[card.code]?.kind !== "base")
        .map((card, index) => ({ card, index, key: order(card) }))
        .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index)
        .map(({ card }) => card),
    );
  }, [pool, deck, cards]);
  const shown = left.filter((stack) => {
    const card = cards[stack.code];
    return matchesKind(card, kind) && (aspects.length === 0 || aspects.some((aspect) => card?.aspects.includes(aspect)));
  });

  const mainStacks = stacks(
    [...deck.cards]
      .sort((a, b) => (cards[a]?.cost ?? 0) - (cards[b]?.cost ?? 0) || faces.name(a).localeCompare(faces.name(b)))
      .map((code) => ({ code })),
  );
  const penalized = deck.cards.filter((code) => swuAspectPenalty(cards[code], identity) > 0).length;
  const baseLabel = (code: string) => {
    const card = cards[code];
    const names = SWU_ASPECTS.filter((aspect) => card?.aspects.includes(aspect)).map((aspect) => t(`swu.aspect.${aspect}`));
    return [faces.name(code), ...names, card ? t("swu.hp", { hp: card.hp }) : ""].filter(Boolean).join(" · ");
  };

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
                  {t(`swu.build.kind.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-row flex-wrap gap-2" role="group" aria-label={t("swu.build.aspectFilter")}>
            {SWU_ASPECTS.map((aspect) => {
              const on = aspects.includes(aspect);
              return (
                <button
                  key={aspect}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setAspects(on ? aspects.filter((value) => value !== aspect) : [...aspects, aspect])}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition",
                    on ? "border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Dot color={ASPECT_HEX[aspect]} />
                  {t(`swu.aspect.${aspect}`)}
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
                const penalty = isSwuMain(card) && deck.leader && deck.base ? swuAspectPenalty(card, identity) : 0;
                return (
                  <LimitedCard
                    key={stack.code}
                    code={stack.code}
                    foil={stack.foil}
                    count={stack.count}
                    faces={faces}
                    dim={penalty > 0}
                    note={penalty > 0 ? t("swu.build.penalty", { count: penalty }) : undefined}
                    label={card?.kind === "leader" ? t("swu.build.chooseLeader", { name }) : t("build.add", { name })}
                    onClick={card ? () => commit(addToSwuDeck(deck, card)) : undefined}
                    onInspect={() => setZoom({ code: stack.code, foil: stack.foil })}
                  />
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("swu.build.hint")}</p>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("build.deck")}</h2>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {SWU_ASPECTS.filter((aspect) => identity.includes(aspect)).map((aspect) => (
                  <Dot key={aspect} color={ASPECT_HEX[aspect]} />
                ))}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("swu.kind.leader")}
              </span>
              <Slot
                name={deck.leader ? faces.name(deck.leader) : t("swu.build.noLeader")}
                empty={!deck.leader}
                onInspect={deck.leader ? () => setZoom({ code: deck.leader }) : undefined}
                onRemove={deck.leader ? () => commit({ ...deck, leader: "" }) : undefined}
                removeLabel={deck.leader ? t("build.remove", { name: faces.name(deck.leader) }) : ""}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("swu.kind.base")}</span>
              <Select
                value={deck.base || NO_BASE}
                onValueChange={(code) => commit({ ...deck, base: code === NO_BASE ? "" : code })}
              >
                <SelectTrigger aria-label={t("swu.kind.base")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_BASE}>{t("swu.build.noBase")}</SelectItem>
                  {opened.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("swu.build.basesOpened")}</SelectLabel>
                      {opened.map((code) => (
                        <SelectItem key={code} value={code}>
                          {baseLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {common.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("swu.build.basesCommon")}</SelectLabel>
                      {common.map((code) => (
                        <SelectItem key={code} value={code}>
                          {baseLabel(code)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{t("swu.build.baseHint")}</span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("swu.build.main")}
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
                  {mainStacks.map((stack) => {
                    const card = cards[stack.code];
                    const penalty = swuAspectPenalty(card, identity);
                    return (
                      <DeckRow
                        key={stack.code}
                        code={stack.code}
                        count={stack.count}
                        faces={faces}
                        name={faces.name(stack.code)}
                        cost={
                          penalty > 0 && card ? (
                            <span className="text-amber-500" title={t("swu.build.penaltyTitle", { count: penalty })}>
                              {card.cost}+{penalty}
                            </span>
                          ) : undefined
                        }
                        removeLabel={t("build.remove", { name: faces.name(stack.code) })}
                        onRemove={() => commit(removeFromSwuDeck(deck, stack.code))}
                        onInspect={() => setZoom({ code: stack.code })}
                      />
                    );
                  })}
                </ul>
              )}
              <CostCurve curve={swuCostCurve(deck, cards)} className="mt-2" />
              {penalized > 0 && <p className="text-xs text-amber-500">{t("swu.build.penalized", { count: penalized })}</p>}
            </div>
          </section>

          <DeckProblems problems={problems} />
        </aside>
      </div>
      <CardZoom code={zoom?.code ?? null} foil={zoom?.foil} faces={faces} onClose={() => setZoom(null)} />
    </div>
  );
}
