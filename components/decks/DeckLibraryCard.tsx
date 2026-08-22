"use client";

import { useState } from "react";
import { DateTime } from "luxon";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";
import { CopyDeckButton } from "@/components/decks/CopyDeckButton.tsx";
import { cn } from "@/lib/utils.ts";
import type { Deck } from "@/lib/types/Deck.ts";

/**
 * Un deck publié, tel qu'il apparaît dans la librairie.
 *
 * La carte doit permettre de trancher sans l'ouvrir : qui l'a écrit, ce qu'il
 * joue, à quel point il est suivi. Les deux boutons disent les deux seules
 * suites possibles — le lire, ou le reprendre.
 */
export function DeckLibraryCard({
  deck,
  gameName,
  isFavorited,
  canInteract,
}: {
  deck: Deck;
  gameName?: string;
  isFavorited: boolean;
  /** Un visiteur non connecté ne peut ni mettre en favori ni copier. */
  canInteract: boolean;
}) {
  const [favorited, setFavorited] = useState(isFavorited);
  const [count, setCount] = useState(deck.favoritesCount ?? 0);
  const updatedAt = DateTime.fromJSDate(new Date(deck.updatedAt)).setLocale("fr");

  const toggleFavorite = async () => {
    const next = !favorited;
    setFavorited(next);
    setCount((current) => Math.max(0, current + (next ? 1 : -1)));

    const response = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favorite: next }),
    }).catch(() => null);

    if (!response?.ok) {
      setFavorited(!next);
      setCount((current) => Math.max(0, current + (next ? -1 : 1)));
      toast.error("Favori non enregistré");
    }
  };

  const tags = [gameName, deck.format, ...(deck.domains ?? [])].filter(Boolean) as string[];

  return (
    <article className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link href={`/decks/${deck.id}`} className="truncate text-[17px] font-semibold hover:underline">
            {deck.name}
          </Link>
          {deck.legendName && (
            <span className="truncate text-[13px] text-muted-foreground">{deck.legendName}</span>
          )}
        </div>
        {canInteract && (
          <Button
            type="button"
            size="sm"
            variant={favorited ? "default" : "outline"}
            onClick={toggleFavorite}
            aria-label={favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
          >
            <Star className={cn("size-3.5", favorited && "fill-current")} />
            {count}
          </Button>
        )}
      </div>

      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
              {tag}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {[deck.creatorName ?? "un joueur", updatedAt.toRelative(), `${deck.views ?? 0} vues`].join(" · ")}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="min-w-32 flex-1">
          <Link href={`/decks/${deck.id}`}>Voir la liste</Link>
        </Button>
        {canInteract && <CopyDeckButton deckId={deck.id} className="min-w-32 flex-1" />}
      </div>
    </article>
  );
}
