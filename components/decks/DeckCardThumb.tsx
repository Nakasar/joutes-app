import CardImage from "@/components/cards/CardImage.tsx";
import { cn } from "@/lib/utils.ts";
import type { DeckCardInfo } from "@/lib/decks/contents.ts";

/**
 * Vignette d'une carte de deck.
 *
 * Une carte sans illustration — un identifiant que le catalogue ne connaît plus
 * après un renommage de série, une carte fraîchement ajoutée sans visuel —
 * garde sa place : la grille resterait sinon trouée, et la quantité, elle,
 * compte toujours. Le cadre porte alors le nom, qui est la seule chose que l'on
 * sache encore d'elle.
 */
export function DeckCardThumb({
  card,
  name,
  className,
  title,
}: {
  card?: DeckCardInfo;
  /** Nom de repli quand le catalogue ne rend pas la carte. */
  name?: string;
  className?: string;
  title?: string;
}) {
  const label = card?.name ?? name ?? "Carte inconnue";

  if (!card?.image) {
    return (
      <span
        title={title ?? label}
        className={cn(
          "flex aspect-[5/7] items-end justify-center rounded-lg border bg-muted p-1.5 text-center text-[10px] leading-tight text-muted-foreground",
          className
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <CardImage
      src={card.image}
      alt={label}
      title={title ?? label}
      orientation={card.orientation}
      frame="5/7"
      loading="lazy"
      className={cn("w-full rounded-lg border object-cover", className)}
    />
  );
}

/** Référence d'une carte telle qu'elle s'imprime dessus : `#OGN-103`. */
export function cardReference(card?: DeckCardInfo): string | undefined {
  if (!card?.setCode || !card.collectorNumber) {
    return undefined;
  }

  return `#${card.setCode}-${card.collectorNumber}`;
}
