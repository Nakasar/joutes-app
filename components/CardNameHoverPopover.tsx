"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CardNameMatch } from "@/lib/db/cards";
import { annotateCardText } from "@/lib/card-text-markdown";
import GameMarkdown from "@/components/GameMarkdown";

export default function CardNameHoverPopover({
  card,
  gameSlug,
  ruleLang,
  children,
}: {
  card: CardNameMatch;
  gameSlug: string;
  ruleLang: "en" | "fr";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Link
          href={`/games/${gameSlug}/cards/${card.id}`}
          className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
        >
          {children}
        </Link>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 max-h-[420px] overflow-y-auto p-3"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        // Radix returns focus to the trigger link on close by default, which
        // fires our own `onFocus` handler below and reopens the popover
        // right away — turning every non-click close (Escape, scroll) into
        // a no-op. This popover is a hover preview, not a focus target, so
        // skip that focus restoration entirely.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <img src={card.image} alt={card.name} className="w-full h-auto rounded mb-2" />
        <div className="text-sm font-semibold leading-tight">{card.name}</div>
        <div className="text-xs text-muted-foreground mb-2">
          {card.type ? `${card.type} · ` : ""}
          {card.setCode} #{card.collectorNumber}
        </div>
        {card.text && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-snug border-t pt-2">
            <GameMarkdown markdown={annotateCardText(card.text)} gameSlug={gameSlug} ruleLang={ruleLang} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
