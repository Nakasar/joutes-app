"use client";

import { HoverCard } from "radix-ui";
import type { CSSProperties } from "react";

import type { TableCard, TableCards } from "@/lib/engine/cards";
import { DOMAIN_HEX, splitTold, type ToldIndex } from "@/lib/engine/told-text";

type ToldTextProps = {
  text: string;
  index: ToldIndex;
  cards: TableCards;
  colorOf: (seat: number) => string;
  onInspect: (card: TableCard) => void;
};

/** Le nom d'une carte aux couleurs de ses domaines : une couleur, ou un dégradé. */
function cardStyle(card: TableCard | undefined): CSSProperties | undefined {
  const colors = (card?.domains ?? []).map((domain) => DOMAIN_HEX[domain.toLowerCase()]).filter(Boolean);
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return { color: colors[0] };
  return {
    backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})`,
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  };
}

/**
 * Une ligne du journal avec ses noms mis en évidence : les joueurs en gras à
 * leur couleur, les cartes en gras aux couleurs de leurs domaines. Survoler une
 * carte la montre, cliquer (ou toucher) l'ouvre en grand.
 */
export function ToldText({ text, index, cards, colorOf, onInspect }: ToldTextProps) {
  return (
    <>
      {splitTold(text, index).map((segment, at) => {
        if (segment.kind === "text") return <span key={at}>{segment.text}</span>;
        if (segment.kind === "player") {
          return (
            <strong key={at} className="font-semibold" style={{ color: colorOf(segment.seat) }}>
              {segment.text}
            </strong>
          );
        }
        const card = cards[segment.code];
        if (!card) return <strong key={at}>{segment.text}</strong>;
        return (
          <HoverCard.Root key={at} openDelay={150} closeDelay={80}>
            <HoverCard.Trigger asChild>
              <button
                type="button"
                className="cursor-zoom-in rounded-sm font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                style={cardStyle(card)}
                onClick={() => onInspect(card)}
              >
                {segment.text}
              </button>
            </HoverCard.Trigger>
            <HoverCard.Portal>
              <HoverCard.Content
                side="left"
                align="center"
                sideOffset={12}
                collisionPadding={8}
                className="z-50 rounded-xl border bg-popover p-1.5 shadow-2xl data-[state=open]:animate-fade-in"
              >
                {card.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={card.image}
                    alt={card.name}
                    className={card.landscape ? "w-80 rounded-lg" : "w-56 rounded-lg"}
                    draggable={false}
                  />
                ) : (
                  <div className="flex w-56 flex-col gap-1 p-2 text-sm">
                    <p className="font-semibold">{card.name}</p>
                    {card.text && <p className="whitespace-pre-line text-xs text-muted-foreground">{card.text}</p>}
                  </div>
                )}
              </HoverCard.Content>
            </HoverCard.Portal>
          </HoverCard.Root>
        );
      })}
    </>
  );
}
