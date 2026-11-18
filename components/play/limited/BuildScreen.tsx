"use client";

import { useMemo, useState } from "react";
import { CircleAlert, CircleCheck, Minus, Plus, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  CardZoom,
  cardName,
  CostCurve,
  DomainDot,
  isMainCard,
  LimitedCard,
  SeatStrip,
} from "@/components/play/limited/limited-kit";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TableCard, TableCards } from "@/lib/engine/cards";
import {
  addToDeck,
  BLANK_BATTLEFIELD,
  chooseChampion,
  chosenDomains,
  clearBattlefield,
  costCurve,
  DOMAINS,
  fitsDomains,
  leftInPool,
  limitedRules,
  mainCodes,
  removeFromMain,
  RUNE_COUNT,
  runeCounts,
  runesFrom,
  splitRunes,
  stacks,
  type Domain,
  type LimitedView,
  type Pulled,
} from "@/lib/engine/limited";
import type { EngineDeckList } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

type KindFilter = "all" | "unit" | "spell" | "gear" | "other";
const KIND_FILTERS: KindFilter[] = ["all", "unit", "spell", "gear", "other"];
const NO_CHAMPION = "none";

function matchesKind(card: TableCard | undefined, filter: KindFilter): boolean {
  if (filter === "all" || !card) return true;
  if (filter === "other") return card.kind === "legend" || card.kind === "battlefield";
  return card.kind === filter;
}

/**
 * La construction du deck avec la réserve : un clic sur une carte de la
 * réserve l'ajoute, un clic dans le deck la retire. Le moteur dit ce qui
 * manque (`problems`) ; rien n'est jugé ici.
 */
export function BuildScreen({
  view,
  seat,
  cards,
  deck,
  runesByHand,
  problems,
  onDeck,
}: {
  view: LimitedView;
  seat: number;
  cards: TableCards;
  deck: EngineDeckList;
  /** Vrai : les runes ont été réparties à la main, on n'y touche plus. */
  runesByHand: boolean;
  /** Ce que le moteur reproche au deck ; vide s'il est légal. */
  problems: string[];
  onDeck: (deck: EngineDeckList, runesByHand: boolean) => void;
}) {
  const t = useTranslations("Games.Limited");
  const tPlay = useTranslations("Games.Play");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [kind, setKind] = useState<KindFilter>("all");
  const [zoom, setZoom] = useState<Pulled | null>(null);

  const pool = useMemo(() => view.you?.pool ?? [], [view.you?.pool]);
  const rules = limitedRules(view.kind);
  const identity = chosenDomains(deck, cards);
  const main = mainCodes(deck);
  const counts = runeCounts(deck, cards);
  const runeDomains = DOMAINS.filter((domain) => identity.includes(domain) || counts[domain] > 0);

  /** Garde le deck ; les runes suivent tant qu'on ne les a pas réparties soi-même. */
  const commit = (next: EngineDeckList, byHand = runesByHand) =>
    onDeck(byHand ? next : { ...next, runes: runesFrom(splitRunes(next, cards), cards) }, byHand);

  const left = useMemo(() => {
    const order = (card: Pulled) => {
      const found = cards[card.code];
      const domain = DOMAINS.findIndex((value) => found?.domains.includes(value));
      return [isMainCard(found) ? 0 : 1, domain < 0 ? DOMAINS.length : domain, found?.energy ?? 0] as const;
    };
    return stacks(
      leftInPool(pool, deck)
        .filter((card) => cards[card.code]?.kind !== "rune")
        .map((card, index) => ({ card, index, key: order(card) }))
        .sort((a, b) => a.key[0] - b.key[0] || a.key[1] - b.key[1] || a.key[2] - b.key[2] || a.index - b.index)
        .map(({ card }) => card),
    );
  }, [pool, deck, cards]);
  const shown = left.filter((stack) => {
    const card = cards[stack.code];
    return matchesKind(card, kind) && (domains.length === 0 || domains.some((domain) => card?.domains.includes(domain)));
  });

  const champions = [...new Set(main)].filter((code) => cards[code]?.champion);
  const mainStacks = stacks(
    [...deck.main]
      .sort(
        (a, b) =>
          (cards[a]?.energy ?? 0) - (cards[b]?.energy ?? 0) || cardName(a, cards, t).localeCompare(cardName(b, cards, t)),
      )
      .map((code) => ({ code })),
  );

  const setRunes = (domain: Domain, delta: number) => {
    const next = { ...counts, [domain]: Math.max(0, counts[domain] + delta) };
    onDeck({ ...deck, runes: runesFrom(next, cards) }, true);
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
                  {t(`build.kind.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-row flex-wrap gap-2" role="group" aria-label={t("build.domainFilter")}>
            {DOMAINS.map((domain) => {
              const on = domains.includes(domain);
              return (
                <button
                  key={domain}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setDomains(on ? domains.filter((value) => value !== domain) : [...domains, domain])}
                  className={cn(
                    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition",
                    on ? "border-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <DomainDot domain={domain} />
                  {tPlay(`domain.${domain}`)}
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
                const name = cardName(stack.code, cards, t);
                return (
                  <LimitedCard
                    key={stack.code}
                    code={stack.code}
                    foil={stack.foil}
                    count={stack.count}
                    cards={cards}
                    dim={isMainCard(card) && !fitsDomains(card, identity)}
                    label={t("build.add", { name })}
                    onClick={card ? () => commit(addToDeck(deck, card)) : undefined}
                    onInspect={() => setZoom({ code: stack.code, foil: stack.foil })}
                  />
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">{t("build.hint")}</p>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("build.deck")}</h2>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                {identity.map((domain) => (
                  <DomainDot key={domain} domain={domain} />
                ))}
                {t("build.identity", { count: identity.length })}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {tPlay("kind.legend")}
              </span>
              <Slot
                name={deck.legend ? cardName(deck.legend, cards, t) : t("noLegend")}
                empty={!deck.legend}
                onInspect={deck.legend ? () => setZoom({ code: deck.legend }) : undefined}
                onRemove={deck.legend ? () => commit({ ...deck, legend: "" }) : undefined}
                removeLabel={deck.legend ? t("build.remove", { name: cardName(deck.legend, cards, t) }) : ""}
              />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("build.champion")}
              </span>
              <Select
                value={deck.champion || NO_CHAMPION}
                onValueChange={(code) => commit(chooseChampion(deck, code === NO_CHAMPION ? "" : code))}
              >
                <SelectTrigger aria-label={t("build.champion")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHAMPION}>{t("build.noChampion")}</SelectItem>
                  {champions.map((code) => (
                    <SelectItem key={code} value={code}>
                      {cardName(code, cards, t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {champions.length === 0 && <span className="text-xs text-muted-foreground">{t("build.championHint")}</span>}
            </div>

            <div className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("build.main")}
                <span
                  className={cn(
                    "text-sm normal-case",
                    main.length >= rules.minMain ? "text-emerald-500" : "text-foreground",
                  )}
                >
                  {t("build.mainCount", { count: main.length, min: rules.minMain })}
                </span>
              </span>
              {main.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("build.mainEmpty")}</p>
              ) : (
                <ul className="flex max-h-80 flex-col overflow-y-auto text-sm">
                  {deck.champion && (
                    <DeckRow
                      code={deck.champion}
                      count={1}
                      cards={cards}
                      name={cardName(deck.champion, cards, t)}
                      badge={t("build.chosen")}
                      removeLabel={t("build.remove", { name: cardName(deck.champion, cards, t) })}
                      onRemove={() => commit({ ...deck, champion: "" })}
                      onInspect={() => setZoom({ code: deck.champion })}
                    />
                  )}
                  {mainStacks.map((stack) => (
                    <DeckRow
                      key={stack.code}
                      code={stack.code}
                      count={stack.count}
                      cards={cards}
                      name={cardName(stack.code, cards, t)}
                      removeLabel={t("build.remove", { name: cardName(stack.code, cards, t) })}
                      onRemove={() => commit(removeFromMain(deck, stack.code))}
                      onInspect={() => setZoom({ code: stack.code })}
                    />
                  ))}
                </ul>
              )}
              <CostCurve curve={costCurve(main, cards)} className="mt-2" />
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex flex-row flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("build.runes", { count: deck.runes.length, total: RUNE_COUNT })}</h2>
              {runesByHand && (
                <Button variant="outline" size="sm" onClick={() => commit(deck, false)}>
                  {t("build.runesAuto")}
                </Button>
              )}
            </div>
            {runeDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("build.runesEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {runeDomains.map((domain) => (
                  <li key={domain} className="flex items-center gap-2 text-sm">
                    <DomainDot domain={domain} />
                    <span className="flex-1">{tPlay(`domain.${domain}`)}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={counts[domain] === 0}
                      onClick={() => setRunes(domain, -1)}
                    >
                      <Minus className="size-3.5" aria-hidden />
                      <span className="sr-only">{t("build.runeLess", { domain: tPlay(`domain.${domain}`) })}</span>
                    </Button>
                    <strong className="w-6 text-center tabular-nums">{counts[domain]}</strong>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      disabled={deck.runes.length >= RUNE_COUNT}
                      onClick={() => setRunes(domain, 1)}
                    >
                      <Plus className="size-3.5" aria-hidden />
                      <span className="sr-only">{t("build.runeMore", { domain: tPlay(`domain.${domain}`) })}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t(runesByHand ? "build.runesByHand" : "build.runesFollow")}</p>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{t("build.battlefields")}</h2>
            <ul className="flex flex-col gap-1.5">
              {deck.battlefields.map((code, index) => {
                const blank = code === BLANK_BATTLEFIELD;
                const name = cardName(code, cards, t);
                return (
                  <li key={index}>
                    <Slot
                      name={name}
                      empty={blank}
                      onInspect={blank ? undefined : () => setZoom({ code })}
                      onRemove={blank ? undefined : () => commit(clearBattlefield(deck, index))}
                      removeLabel={t("build.remove", { name })}
                    />
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted-foreground">{t("build.battlefieldsHint")}</p>
          </section>

          <section className="flex flex-col gap-2 rounded-xl border bg-card p-5" aria-live="polite">
            <h2 className="flex items-center gap-2 font-semibold">
              {problems.length === 0 ? (
                <CircleCheck className="size-4 text-emerald-500" aria-hidden />
              ) : (
                <CircleAlert className="size-4 text-amber-500" aria-hidden />
              )}
              {t(problems.length === 0 ? "build.legal" : "build.problems", { count: problems.length })}
            </h2>
            {problems.length > 0 && (
              <ul className="list-disc pl-5 text-sm text-muted-foreground">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">{t("build.checked")}</p>
          </section>
        </aside>
      </div>
      <CardZoom code={zoom?.code ?? null} foil={zoom?.foil} cards={cards} onClose={() => setZoom(null)} />
    </div>
  );
}

/** Une place du deck qui ne tient qu'une carte : la Légende, un champ de bataille. */
function Slot({
  name,
  empty,
  onInspect,
  onRemove,
  removeLabel,
}: {
  name: string;
  empty: boolean;
  onInspect?: () => void;
  onRemove?: () => void;
  removeLabel: string;
}) {
  const t = useTranslations("Games.Limited");
  return (
    <span
      className={cn(
        "flex min-h-10 items-center gap-1 rounded-lg border px-3 text-sm",
        empty && "border-dashed text-muted-foreground",
      )}
    >
      <span className="flex-1 truncate">{name}</span>
      {onInspect && (
        <button type="button" onClick={onInspect} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
          <Search className="size-3.5" aria-hidden />
          <span className="sr-only">{t("inspect", { name })}</span>
        </button>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" aria-hidden />
          <span className="sr-only">{removeLabel}</span>
        </button>
      )}
    </span>
  );
}

/** Une ligne du deck principal : un clic retire un exemplaire. */
function DeckRow({
  code,
  count,
  name,
  cards,
  badge,
  removeLabel,
  onRemove,
  onInspect,
}: {
  code: string;
  count: number;
  name: string;
  cards: TableCards;
  badge?: string;
  removeLabel: string;
  onRemove: () => void;
  onInspect: () => void;
}) {
  const t = useTranslations("Games.Limited");
  const card = cards[code];
  return (
    <li className="flex items-center gap-1 border-b last:border-b-0">
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded px-1 text-left hover:bg-secondary"
      >
        <span className="w-6 shrink-0 text-muted-foreground">×{count}</span>
        <span className="flex shrink-0 gap-0.5">
          {DOMAINS.filter((domain) => card?.domains.includes(domain)).map((domain) => (
            <DomainDot key={domain} domain={domain} className="size-2" />
          ))}
        </span>
        <span className="truncate">{name}</span>
        {badge && <span className="shrink-0 rounded bg-secondary px-1.5 text-[0.7rem]">{badge}</span>}
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">{card?.energy ?? ""}</span>
      </button>
      <button type="button" onClick={onInspect} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
        <Search className="size-3.5" aria-hidden />
        <span className="sr-only">{t("inspect", { name })}</span>
      </button>
    </li>
  );
}
