import "server-only";

import { ObjectId } from "mongodb";
import { cacheLife } from "next/cache";

import db from "@/lib/mongodb";
import type { CardGlossaryEntry } from "@/lib/cards/translations";
import { getCardGlossary } from "@/lib/db/card-translations";
import { getCardPrices } from "@/lib/db/card-prices";
import { getCardsByNames } from "@/lib/db/cards";
import { getErratasByCardId } from "@/lib/db/erratas";
import type { BoosterCard } from "@/lib/types/booster";
import type { CardPrinting } from "@/lib/types/card";
import type { CardPrice, CardPriceSource } from "@/lib/types/card-price";
import type { Errata } from "@/lib/types/errata";

/**
 * Ce qu'une fiche de carte lit pour un visiteur sans compte, gardé en cache.
 *
 * Les fiches sont les pages les plus visitées du site, par des lecteurs et par
 * des robots, et leur contenu ne change presque jamais. Chaque affichage
 * refaisait pourtant six lectures en base. Un visiteur sans compte voit la
 * même fiche que tous les autres : ces lectures sont partagées quelques
 * minutes. Un compte connecté continue de lire la base, pour voir tout de
 * suite ce qu'il vient de changer (son vote, un errata, un bannissement).
 *
 * `cacheLife("minutes")` : une copie sert cinq minutes, et se refait en
 * arrière-plan au-delà d'une minute. `use cache: remote` : la copie est
 * partagée par toutes les instances de fonction, pas refaite par chacune.
 */

export type CatalogCard = BoosterCard & { printings?: CardPrinting[] };

/**
 * Un document Mongo ramené à des objets simples : le cache ne transporte ni
 * `ObjectId` ni classe du pilote. Les dates, elles, passent telles quelles.
 */
function toPlain<T>(value: T): T {
  if (value instanceof ObjectId) return value.toHexString() as unknown as T;
  if (value instanceof Date || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(toPlain) as unknown as T;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toPlain(entry)])) as T;
}

/** La carte d'un jeu, par son identifiant. */
export async function readCatalogCard(gameId: string, cardId: string): Promise<CatalogCard | null> {
  "use cache: remote";
  cacheLife("minutes");

  const card = await db
    .collection<CatalogCard>("cards")
    .findOne({ id: cardId, gameId: new ObjectId(gameId) }, { projection: { _id: 0, gameId: 0 } });
  return card ? toPlain(card as CatalogCard) : null;
}

/** Ce que les métadonnées de la fiche lisent : le nom, l'image, le bannissement, le nombre de rulings. */
export async function readCardHeadline(
  gameId: string,
  cardId: string,
): Promise<{ name: string; image?: string; banned: boolean; erratas: number } | null> {
  "use cache: remote";
  cacheLife("minutes");

  const card = await db
    .collection<BoosterCard>("cards")
    .findOne({ id: cardId, gameId: new ObjectId(gameId) }, { projection: { _id: 0, name: 1, image: 1, banned: 1 } });
  if (!card) return null;

  const erratas = await getErratasByCardId(cardId);
  return { name: card.name, image: card.image, banned: Boolean(card.banned), erratas: erratas.length };
}

/** Les erratas et rulings de la carte, sans le vote de quiconque. */
export async function readCardErratas(cardId: string): Promise<Errata[]> {
  "use cache: remote";
  cacheLife("minutes");

  return toPlain(await getErratasByCardId(cardId));
}

/** Le glossaire d'un jeu dans une langue. */
export async function readCardGlossary(gameId: string, lang: string): Promise<CardGlossaryEntry[]> {
  "use cache: remote";
  cacheLife("hours");

  return toPlain(await getCardGlossary(new ObjectId(gameId), lang));
}

/** Les relevés de prix de la carte, dans l'ordre de fournisseurs demandé. */
export async function readCardPrices(
  gameId: string,
  cardId: string,
  sources: readonly CardPriceSource[],
): Promise<CardPrice[]> {
  "use cache: remote";
  cacheLife("hours");

  return toPlain(await getCardPrices(new ObjectId(gameId), cardId, sources));
}

/** Les cartes citées par leur nom dans les erratas. */
export async function readCardsByNames(gameId: string, names: string[]) {
  "use cache: remote";
  cacheLife("hours");

  return toPlain(await getCardsByNames(new ObjectId(gameId), names));
}
