import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { readableCardText, toCatalogId, type TableCards } from "@/lib/engine/cards";
import { engineCards } from "@/lib/engine/server";

export const TABLE_CARDS_CACHE_TAG = "engine-table-cards";

/**
 * Ce que la table affiche de chaque carte du moteur : le nom et l'illustration
 * viennent du catalogue Joutes, le texte et les chiffres du moteur (qui est
 * celui qui les applique).
 *
 * En cache : ni le moteur ni les illustrations ne changent entre deux
 * déploiements, et la table en demande quelques centaines d'un coup.
 */
export async function readTableCards(gameId: string): Promise<TableCards> {
  "use cache";
  cacheLife("days");
  cacheTag(TABLE_CARDS_CACHE_TAG);

  const engine = [...engineCards().values()];
  const infos = await getDeckCardInfos(
    gameId,
    engine.map((card) => toCatalogId(card.code)),
  );
  const byId = new Map(infos.map((info) => [info.id, info]));

  const cards: TableCards = {};
  for (const card of engine) {
    const info = byId.get(toCatalogId(card.code));
    cards[card.code] = {
      code: card.code,
      name: info?.name ?? card.name,
      kind: card.kind,
      ...(info?.image ? { image: info.image } : {}),
      ...(info?.orientation === "landscape" || card.kind === "battlefield" ? { landscape: true } : {}),
      ...(card.text ? { text: readableCardText(card.text) } : {}),
      ...(card.kind === "unit" ? { might: card.might } : {}),
      energy: card.energy,
      power: card.power,
      domains: card.domains,
      ...(card.champion ? { champion: true } : {}),
      ...(card.token ? { token: true } : {}),
      playable: card.coverage !== "none",
    };
  }
  return cards;
}
