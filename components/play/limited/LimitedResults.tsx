"use client";

import { Trophy } from "lucide-react";
import { useTranslations } from "next-intl";

import { cardName, CostCurve, DomainDot } from "@/components/play/limited/limited-kit";
import { Button } from "@/components/ui/button";
import type { TableCards } from "@/lib/engine/cards";
import { chosenDomains, costCurve, mainCodes, matchOf, type LimitedView } from "@/lib/engine/limited";
import type { EngineDeckList } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

/** Le bilan de l'évènement : mon match, ceux des autres tables, et le deck joué. */
export function LimitedResults({
  view,
  seat,
  cards,
  deck,
  onReplay,
  onLeave,
}: {
  view: LimitedView;
  seat: number;
  cards: TableCards;
  deck: EngineDeckList | null;
  onReplay?: () => void;
  onLeave: () => void;
}) {
  const t = useTranslations("Games.Limited");
  const mine = matchOf(view, seat);
  const nameOf = (index: number) => view.seats[index]?.name ?? "?";
  const outcome = !mine
    ? "bye"
    : !mine.match.done
      ? "pending"
      : mine.match.winner === null
        ? "draw"
        : mine.match.winner === seat
          ? "won"
          : "lost";
  const opponent = mine ? nameOf(mine.match.seats.find((other) => other !== seat) ?? -1) : "";
  const main = deck ? mainCodes(deck) : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
      <div className="flex flex-col gap-4">
        <section className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            {outcome === "won" && <Trophy className="size-6 text-amber-400" aria-hidden />}
            {t(`results.${outcome}`)}
          </h2>
          {mine && <p className="text-muted-foreground">{t("results.against", { name: opponent })}</p>}
          <div className="flex flex-row flex-wrap gap-2">
            {onReplay && (
              <Button variant="outline" onClick={onReplay}>
                {t("results.replay")}
              </Button>
            )}
            <Button onClick={onLeave}>{t("results.leave")}</Button>
          </div>
          {onReplay && <p className="text-xs text-muted-foreground">{t("results.replayHint")}</p>}
        </section>

        {view.matches.length > 1 && (
          <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <h2 className="font-semibold">{t("results.tables")}</h2>
            <ul className="flex flex-col">
              {view.matches.map((match, index) => (
                <li
                  key={index}
                  className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 border-t py-2.5 text-sm first:border-t-0"
                >
                  <span className="w-16 shrink-0 text-muted-foreground">{t("results.table", { number: index + 1 })}</span>
                  <span className="flex-1">
                    {match.seats.map((player, place) => (
                      <span key={player}>
                        {place > 0 && <span className="text-muted-foreground"> · </span>}
                        <span
                          className={cn(
                            match.done && match.winner === player && "font-semibold",
                            player === seat && "underline",
                          )}
                        >
                          {nameOf(player)}
                        </span>
                      </span>
                    ))}
                  </span>
                  <span className="text-muted-foreground" role="status">
                    {!match.done
                      ? t("results.playing")
                      : match.winner === null
                        ? t("results.tableDraw")
                        : t("results.tableWon", { name: nameOf(match.winner) })}
                  </span>
                </li>
              ))}
            </ul>
            {view.bye !== null && (
              <p className="text-sm text-muted-foreground">{t("results.byeOf", { name: nameOf(view.bye) })}</p>
            )}
          </section>
        )}
      </div>

      {deck && (
        <aside className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t("results.deck", { count: main.length })}</h2>
            <span className="flex gap-1">
              {chosenDomains(deck, cards).map((domain) => (
                <DomainDot key={domain} domain={domain} />
              ))}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {deck.legend ? cardName(deck.legend, cards, t) : t("noLegend")}
            {deck.champion ? ` · ${cardName(deck.champion, cards, t)}` : ""}
          </p>
          <CostCurve curve={costCurve(main, cards)} />
          <ul className="flex max-h-96 flex-col overflow-y-auto text-sm">
            {[...new Set(main)]
              .sort((a, b) => (cards[a]?.energy ?? 0) - (cards[b]?.energy ?? 0))
              .map((code) => (
                <li key={code} className="flex items-center gap-2 border-b py-1.5 last:border-b-0">
                  <span className="w-6 shrink-0 text-muted-foreground">
                    ×{main.filter((other) => other === code).length}
                  </span>
                  <span className="truncate">{cardName(code, cards, t)}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">{cards[code]?.energy ?? ""}</span>
                </li>
              ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
