import { Layers } from "lucide-react";

import { cn } from "@/lib/utils.ts";
import { deckCoverPosition, type DeckCover } from "@/lib/decks/cover.ts";

/**
 * L'illustration d'un deck, partout où le deck se montre.
 *
 * Un seul composant pour la vignette d'une liste et le bandeau d'une fiche :
 * le cadrage suit la provenance — une illustration de carte porte son sujet en
 * haut, une image déposée a été choisie pour son centre — et le repli est le
 * même partout, plutôt qu'un trou d'une taille différente par écran.
 *
 * Une balise `img` nue : l'illustration vient du catalogue de cartes du jeu,
 * dont l'hôte n'est pas déclaré dans `next.config.ts` et que le composant
 * image de Next refuserait donc.
 */
export function DeckCoverImage({
  cover,
  name,
  className,
  rounded,
}: {
  cover: DeckCover;
  /** Nom du deck : ce qui reste à afficher quand il n'y a pas d'image. */
  name?: string;
  className?: string;
  rounded?: string;
}) {
  const shell = cn("relative block overflow-hidden bg-muted", rounded, className);

  if (!cover.image) {
    return (
      <span className={cn(shell, "flex items-center justify-center")} aria-hidden>
        <Layers className="size-5 text-muted-foreground/50" />
      </span>
    );
  }

  return (
    <span className={shell}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cover.image}
        alt=""
        title={name}
        loading="lazy"
        className={cn(
          "size-full object-cover",
          deckCoverPosition(cover.source) === "top" ? "object-top" : "object-center"
        )}
      />
    </span>
  );
}
