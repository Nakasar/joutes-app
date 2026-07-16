"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CardNameMatch } from "@/lib/db/cards";

export default function CardNameHoverPopover({
  card,
  gameSlug,
  children,
}: {
  card: CardNameMatch;
  gameSlug: string;
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
        className="w-40 p-2"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <img src={card.image} alt={card.name} className="w-full h-auto rounded" />
      </PopoverContent>
    </Popover>
  );
}
