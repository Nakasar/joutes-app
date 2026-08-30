import type { CardPrinting } from "@/lib/types/card";

/**
 * Document de recherche d'une carte importée.
 *
 * Un import ne connaît que ce que publie la source officielle. Le document de
 * recherche, lui, est réécrit **en entier** à chaque envoi : tout ce que la
 * source ignore et que l'import ne recopie pas disparaît de l'index, alors même
 * que la base l'a toujours. C'est ici qu'on remet ce qui ne vient pas de la
 * source.
 */

/**
 * L'identifiant d'un document Meilisearch n'accepte pas `*`, qu'utilisent
 * certains numéros de collection ; l'identifiant en base le garde. Le document
 * porte donc les deux : l'identifiant assaini comme clé, l'identifiant réel
 * dans `cardId`.
 */
export function searchDocumentId(cardId: string): string {
  return cardId.replaceAll("*", "s");
}

/**
 * Document à envoyer à l'index pour une carte importée, complété des variantes
 * d'impression déjà enregistrées en base.
 *
 * Les variantes ne viennent jamais d'un import : elles sont saisies depuis
 * l'administration (fiche de carte ou ajout en masse) et l'import les laisse
 * intactes en base — il n'écrit que les champs qu'il connaît. Sans ce rappel
 * elles ne survivraient pas pour autant, parce que les écrans qui ajoutent un
 * exemplaire depuis un résultat de recherche lisent les variantes du document
 * d'index, pas de la base : un import les ferait disparaître de la galerie de
 * cartes, des boosters et des listes de souhaits.
 */
export function importedCardSearchDocument<T extends { id: string }>(
  card: T,
  storedPrintings?: CardPrinting[]
): T & { id: string; cardId: string; printings?: CardPrinting[] } {
  return {
    ...card,
    id: searchDocumentId(card.id),
    cardId: card.id,
    ...(storedPrintings?.length ? { printings: storedPrintings } : {}),
  };
}
