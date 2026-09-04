import { zoneEntries, type DeckCardInfo, type DeckCards } from "@/lib/decks/contents";
import type { DeckZone } from "@/lib/decks/zones";

/**
 * D'où vient l'illustration d'un deck.
 *
 * Trois choix explicites et un repli : une image déposée par l'auteur, une
 * carte du deck qu'il a désignée, ou — tant qu'il n'a rien désigné — la carte
 * qui donne déjà son identité au deck. `none` est le deck qui n'a ni l'une ni
 * l'autre, et qui s'affiche donc en aplat.
 */
export type DeckCoverSource = "upload" | "card" | "legend" | "none";

/** Ce qu'un deck porte de sa couverture, et rien d'autre. */
export type DeckCoverFields = {
  /** Image déposée par l'auteur. Prime sur tout le reste. */
  coverImageUrl?: string;
  /** Carte du deck choisie pour l'illustrer. */
  coverCardId?: string;
  /** Adresse effectivement affichée — dérivée, écrite à l'enregistrement. */
  coverImage?: string;
  legendCardId?: string;
};

export type DeckCover = {
  source: DeckCoverSource;
  image?: string;
  /** La carte désignée, quand la couverture en est une. */
  cardId?: string;
};

/**
 * La couverture d'un deck, telle qu'un écran doit l'afficher.
 *
 * Le catalogue est **facultatif** : une fiche de deck l'a sous la main et rend
 * donc toujours l'illustration à jour, une liste ne l'a pas et lit la valeur
 * dénormalisée `coverImage`. Les deux passent par ici pour que la vignette
 * d'une liste et le bandeau de la fiche ne puissent pas montrer deux images
 * différentes du même deck.
 *
 * L'ordre est celui de l'intention : ce que l'auteur a déposé, puis ce qu'il a
 * désigné, puis ce que le deck dit déjà de lui-même.
 */
export function resolveDeckCover(
  deck: DeckCoverFields,
  cardsById?: Map<string, DeckCardInfo>
): DeckCover {
  if (deck.coverImageUrl) {
    return { source: "upload", image: deck.coverImageUrl };
  }

  if (deck.coverCardId) {
    return {
      source: "card",
      cardId: deck.coverCardId,
      image: cardsById?.get(deck.coverCardId)?.image ?? deck.coverImage,
    };
  }

  if (deck.legendCardId) {
    return {
      source: "legend",
      cardId: deck.legendCardId,
      image: cardsById?.get(deck.legendCardId)?.image ?? deck.coverImage,
    };
  }

  return { source: "none", image: deck.coverImage };
}

/** Raccourci pour les écrans qui n'ont besoin que de l'adresse. */
export function deckCoverImage(
  deck: DeckCoverFields,
  cardsById?: Map<string, DeckCardInfo>
): string | undefined {
  return resolveDeckCover(deck, cardsById).image;
}

/**
 * Les cartes parmi lesquelles choisir une couverture : celles du deck, dans
 * l'ordre des zones, chacune une seule fois.
 *
 * L'ordre des zones et non celui de la saisie : la légende et les champions
 * ouvrent la liste parce que c'est là que se trouve, presque toujours, la carte
 * qui illustre le deck. Une carte jouée dans deux zones n'apparaît qu'une fois
 * — on choisit une illustration, pas un exemplaire.
 */
export function deckCoverCandidates(cards: DeckCards | undefined, zones: DeckZone[]): string[] {
  const seen = new Set<string>();

  for (const zone of zones) {
    for (const entry of zoneEntries(cards, zone.key)) {
      seen.add(entry.cardId);
    }
  }

  return [...seen];
}

/**
 * Le cadrage d'une couverture.
 *
 * Une illustration de carte porte son sujet en haut — le cadrer au centre
 * décapite le personnage dans un bandeau panoramique. Une image déposée, elle,
 * a été choisie pour ce qu'elle montre : c'est son centre qui compte.
 */
export function deckCoverPosition(source: DeckCoverSource): "top" | "center" {
  return source === "upload" ? "center" : "top";
}

/**
 * Une adresse d'image de couverture acceptable.
 *
 * Seul le stockage de l'application est admis. Accepter une adresse
 * quelconque reviendrait à laisser un deck public faire charger au navigateur
 * de chacun de ses lecteurs une image servie par un tiers — qui en verrait
 * l'adresse IP —, et `next.config.ts` ne déclare de toute façon que cet hôte.
 * L'auteur dépose son image par `POST /api/decks/{deckId}/cover`, qui rend
 * l'adresse à réécrire ici.
 */
export function isDeckCoverImageUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  return (
    url.protocol === "https:" &&
    (url.hostname === "blob.vercel-storage.com" ||
      url.hostname.endsWith(".public.blob.vercel-storage.com"))
  );
}
