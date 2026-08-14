import 'server-only';
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { DateTime } from "luxon";
import { customAlphabet } from "nanoid";
import { removeSellListItemsByCollectionEntryIds } from "@/lib/db/sell-lists";
import { getUsersByIds, toPublicUser, type PublicUser } from "@/lib/db/users";
import {
  TRADE_CATALOG_MIN_QUERY,
  TRADE_MAX_CARDS_PER_SIDE,
  TRADE_MAX_QUANTITY,
} from "@/lib/constants/trade";
import { getCardMarketPrices } from "@/lib/db/card-prices";
import type { CardMarketPrice } from "@/lib/prices/display";

/**
 * Échange de cartes.
 *
 * Un échange est une opération locale sur la collection de l'utilisateur : les
 * cartes cédées (« mon offre ») sont retirées de la collection, les cartes
 * reçues y sont ajoutées. Les deux faces manipulent des identités différentes :
 *
 *  - une carte cédée est identifiée par (name, setCode, collectorNumber), les
 *    trois champs dénormalisés sur `collection-cards` à l'écriture — c'est ainsi
 *    que le reste du code compte les exemplaires possédés, `cards.id` n'étant
 *    pas strictement unique (voir la note de `lib/db/collection.ts`) ;
 *  - une carte reçue est identifiée par son `cards.id` de catalogue, seule
 *    source des données réellement insérées en collection.
 */

/** Une impression du catalogue ou de la collection, proposable à l'échange. */
export type TradeCard = {
  /** Clé stable d'une impression : `name|setCode|collectorNumber`. */
  key: string;
  /** Id catalogue (`cards.id`). Absent pour de rares entrées de collection historiques. */
  cardId?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  type?: string;
  gameId?: string;
  gameName?: string;
  gameSlug?: string;
  /** Nombre d'exemplaires de cette impression possédés par l'utilisateur. */
  owned: number;
  /** Prix de marché relevé pour la carte (cf. docs/CARD_PRICES.md). */
  marketPrice?: CardMarketPrice;
};

export type TradeCardSearchResult = {
  items: TradeCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  /** Vrai quand la recherche catalogue a été ignorée faute d'un terme assez long. */
  needsQuery: boolean;
};

export type TradeCardScope = "collection" | "catalog";

export type TradeGame = { id: string; name: string; slug?: string };

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cardKey(name: string, setCode: string, collectorNumber: string): string {
  return `${name}|${setCode}|${collectorNumber}`;
}

async function getGamesMeta(gameIds: ObjectId[]): Promise<Map<string, TradeGame>> {
  if (gameIds.length === 0) return new Map();

  const docs = await db
    .collection("games")
    .find({ _id: { $in: gameIds } }, { projection: { name: 1, slug: 1 } })
    .toArray();

  return new Map(
    docs.map((game) => [
      game._id.toString(),
      { id: game._id.toString(), name: game.name as string, slug: game.slug as string | undefined },
    ])
  );
}

/** Jeux disposant d'un catalogue de cartes, pour le filtre de recherche de l'interface d'échange. */
export async function listTradeGames(): Promise<TradeGame[]> {
  const gameIds = ((await db.collection("cards").distinct("gameId")) as unknown[]).filter(
    (id): id is ObjectId => id instanceof ObjectId
  );

  return [...(await getGamesMeta(gameIds)).values()].sort((a, b) => a.name.localeCompare(b.name));
}

type SearchFacet = [{ total: Array<{ n: number }>; items: Record<string, unknown>[] } | undefined];

/**
 * Recherche paginée de cartes, tous jeux confondus.
 *
 *  - `collection` : uniquement les impressions possédées par l'utilisateur ; une
 *    recherche vide liste toute la collection (c'est la source par défaut de
 *    « mon offre ») ;
 *  - `catalog` : toutes les cartes de tous les jeux, dédupliquées par impression
 *    (les différentes langues d'une même carte sont regroupées).
 */
export async function searchTradeCards({
  userId,
  query,
  scope,
  gameId,
  page = 1,
  limit = 24,
}: {
  userId: string;
  query?: string;
  scope: TradeCardScope;
  gameId?: string;
  page?: number;
  limit?: number;
}): Promise<TradeCardSearchResult> {
  const userObjId = new ObjectId(userId);
  const trimmed = (query ?? "").trim();
  const nameFilter = trimmed ? { name: { $regex: escapeRegex(trimmed), $options: "i" } } : {};
  const gameObjId = gameId && ObjectId.isValid(gameId) ? new ObjectId(gameId) : null;
  const skip = (page - 1) * limit;

  if (scope === "catalog" && trimmed.length < TRADE_CATALOG_MIN_QUERY) {
    return { items: [], total: 0, page, limit, totalPages: 1, needsQuery: true };
  }

  const pipeline: Record<string, unknown>[] =
    scope === "collection"
      ? [
          { $match: { userId: userObjId, ...nameFilter } },
          {
            $group: {
              _id: {
                name: "$name",
                setCode: "$setCode",
                collectorNumber: { $toString: "$collectorNumber" },
              },
              cardId: { $first: "$cardId" },
              image: { $first: "$image" },
              owned: { $sum: 1 },
            },
          },
          {
            $lookup: {
              from: "cards",
              localField: "cardId",
              foreignField: "id",
              as: "catalog",
              pipeline: [{ $project: { _id: 0, gameId: 1, type: 1 } }],
            },
          },
          { $addFields: { catalog: { $arrayElemAt: ["$catalog", 0] } } },
          ...(gameObjId ? [{ $match: { "catalog.gameId": gameObjId } }] : []),
          { $sort: { "_id.name": 1, "_id.setCode": 1, "_id.collectorNumber": 1 } },
          {
            $facet: {
              total: [{ $count: "n" }],
              items: [{ $skip: skip }, { $limit: limit }],
            },
          },
        ]
      : [
          { $match: { ...nameFilter, ...(gameObjId ? { gameId: gameObjId } : {}) } },
          // Projection avant tri : les documents de catalogue sont volumineux
          // (texte, prix, métadonnées de jeu) et une recherche large peut en
          // ramener beaucoup.
          {
            $project: {
              _id: 0,
              id: 1,
              name: 1,
              setCode: 1,
              collectorNumber: 1,
              type: 1,
              gameId: 1,
              image: { $ifNull: ["$image", "$poster"] },
              // Une même impression existe en plusieurs langues : on n'en garde
              // qu'une, en préférant l'anglais, langue pivot du catalogue.
              langRank: { $cond: [{ $eq: ["$lang", "en"] }, 0, 1] },
            },
          },
          { $sort: { langRank: 1 } },
          {
            $group: {
              _id: {
                gameId: "$gameId",
                setCode: "$setCode",
                collectorNumber: { $toString: "$collectorNumber" },
              },
              cardId: { $first: "$id" },
              name: { $first: "$name" },
              image: { $first: "$image" },
              type: { $first: "$type" },
            },
          },
          { $sort: { name: 1, "_id.setCode": 1, "_id.collectorNumber": 1 } },
          {
            $facet: {
              total: [{ $count: "n" }],
              items: [{ $skip: skip }, { $limit: limit }],
            },
          },
        ];

  const [facet] = (await db
    .collection(scope === "collection" ? "collection-cards" : "cards")
    // Une recherche large sur l'ensemble du catalogue peut dépasser la limite
    // mémoire d'un tri.
    .aggregate(pipeline, { allowDiskUse: true })
    .toArray()) as unknown as SearchFacet;

  const total = facet?.total?.[0]?.n ?? 0;
  const rows = facet?.items ?? [];

  const rawItems = rows.map((row) => {
    const id = row._id as Record<string, unknown>;
    const catalog = (row.catalog ?? null) as { gameId?: ObjectId; type?: string } | null;
    const rowGameId = (scope === "collection" ? catalog?.gameId : (id.gameId as ObjectId | undefined)) ?? null;

    return {
      name: (scope === "collection" ? id.name : row.name) as string,
      setCode: id.setCode as string,
      collectorNumber: (id.collectorNumber as string) ?? "",
      cardId: (row.cardId as string | undefined) || undefined,
      image: (row.image as string | undefined) ?? "",
      type: (scope === "collection" ? catalog?.type : (row.type as string | undefined)) || undefined,
      gameId: rowGameId ? rowGameId.toString() : undefined,
      owned: (row.owned as number | undefined) ?? 0,
    };
  });

  const gamesMeta = await getGamesMeta(
    [...new Set(rawItems.map((it) => it.gameId).filter((id): id is string => !!id))].map((id) => new ObjectId(id))
  );

  // Le catalogue ne connaît pas les exemplaires possédés : on les compte pour la
  // page renvoyée, sur la même identité (nom + extension + numéro) que celle
  // utilisée par le reste de la collection.
  const ownedByKey =
    scope === "catalog" ? await getOwnedCountsByKey(userObjId, rawItems) : new Map<string, number>();

  // Le prix accompagne la carte dès la recherche : c'est aussi ce qui aide à
  // choisir quoi mettre dans une offre.
  const marketPrices = await marketPricesForCards(rawItems);

  const items: TradeCard[] = rawItems.map((it) => {
    const key = cardKey(it.name, it.setCode, it.collectorNumber);
    const game = it.gameId ? gamesMeta.get(it.gameId) : undefined;
    const marketPrice = it.cardId && it.gameId ? marketPrices.get(`${it.gameId}|${it.cardId}`) : undefined;

    return {
      key,
      cardId: it.cardId,
      name: it.name,
      setCode: it.setCode,
      collectorNumber: it.collectorNumber,
      image: it.image,
      type: it.type,
      gameId: it.gameId,
      gameName: game?.name,
      gameSlug: game?.slug,
      owned: scope === "catalog" ? ownedByKey.get(key) ?? 0 : it.owned,
      ...(marketPrice ? { marketPrice } : {}),
    };
  });

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    needsQuery: false,
  };
}

/** Exemplaires possédés pour un lot d'impressions, indexés par `name|setCode|collectorNumber`. */
async function getOwnedCountsByKey(
  userObjId: ObjectId,
  items: { name: string; setCode: string; collectorNumber: string }[]
): Promise<Map<string, number>> {
  const names = [...new Set(items.map((it) => it.name))];
  if (names.length === 0) return new Map();

  const rows = await db
    .collection("collection-cards")
    .aggregate<{ _id: { name: string; setCode: string; collectorNumber: string }; n: number }>([
      { $match: { userId: userObjId, name: { $in: names } } },
      {
        $group: {
          _id: { name: "$name", setCode: "$setCode", collectorNumber: { $toString: "$collectorNumber" } },
          n: { $sum: 1 },
        },
      },
    ])
    .toArray();

  return new Map(rows.map((row) => [cardKey(row._id.name, row._id.setCode, row._id.collectorNumber), row.n]));
}

// ---------------------------------------------------------------------------
// Échanges persistés
// ---------------------------------------------------------------------------

/**
 * Un échange est un document `trades` partagé par deux « faces ».
 *
 *  - la face `a` est toujours celle du créateur ;
 *  - la face `b` est celle de la contrepartie. Tant qu'aucun compte ne l'occupe
 *    (`userId` absent), l'échange est dit « libre » : le créateur y décrit
 *    lui-même les cartes qu'il reçoit, comme un simple enregistrement d'échange
 *    fait en main propre. Dès qu'un partenaire la rejoint, elle lui appartient
 *    et le créateur ne peut plus la modifier.
 *
 * Chaque face possédée par un compte doit être validée pour que l'échange
 * s'applique. Toute modification d'une offre incrémente `revision` et annule les
 * validations : on ne peut pas valider un contenu qu'on n'a pas vu.
 */

/** Carte figée dans une offre : le snapshot est résolu côté serveur, jamais fourni par le client. */
export type TradeCardSnapshot = {
  cardId?: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  image: string;
  gameId?: string;
  gameName?: string;
  gameSlug?: string;
  quantity: number;
  /**
   * Prix décidé par le propriétaire de la face, à l'unité. Absent, c'est le
   * prix de marché qui s'applique : négocier un prix est un choix, pas un
   * réglage à refaire à chaque carte.
   */
  unitPrice?: number;
  /**
   * Prix de marché relevé pour la carte. Relu à chaque lecture de l'échange
   * plutôt qu'enregistré : c'est une référence, elle doit suivre les imports.
   */
  marketPrice?: CardMarketPrice;
};

export type TradeSideId = "a" | "b";

export type TradeSide = {
  id: TradeSideId;
  /** `null` tant que la face n'est pas occupée par un compte (échange libre). */
  user: PublicUser | null;
  cards: TradeCardSnapshot[];
  validatedAt: string | null;
};

export type TradeStatus = "open" | "completed" | "cancelled";

export type Trade = {
  id: string;
  code: string;
  status: TradeStatus;
  revision: number;
  sides: TradeSide[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
};

type TradeSideDocument = {
  id: TradeSideId;
  userId?: ObjectId;
  cards: TradeCardSnapshot[];
  validatedAt?: Date | null;
};

type TradeDocument = {
  _id: ObjectId;
  code: string;
  status: TradeStatus;
  revision: number;
  sides: TradeSideDocument[];
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  cancelledBy?: ObjectId;
  /** Verrou posé le temps d'appliquer l'échange, pour ne jamais l'appliquer deux fois. */
  applying?: boolean;
};

const TRADES_COLLECTION = "trades";

/** Alphabet lisible (sans 0/O ni 1/I/L) : le code est recopié à la main ou scanné. */
const TRADE_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TRADE_CODE_LENGTH = 8;
const generateTradeCode = customAlphabet(TRADE_CODE_ALPHABET, TRADE_CODE_LENGTH);
const TRADE_CODE_PATTERN = new RegExp(`^[${TRADE_CODE_ALPHABET}]{${TRADE_CODE_LENGTH}}$`);

export function isValidTradeCode(code: string): boolean {
  return TRADE_CODE_PATTERN.test(code);
}

// `createIndex` est idempotent : la promesse est créée une fois par instance et
// attendue avant les écritures qui en dépendent.
const tradeIndexesReady = Promise.all([
  db.collection(TRADES_COLLECTION).createIndex({ code: 1 }, { unique: true }),
  db.collection(TRADES_COLLECTION).createIndex({ "sides.userId": 1, updatedAt: -1 }),
]).catch((error) => {
  console.error("Impossible de créer les index des échanges:", error);
});

function toTrade(
  doc: TradeDocument,
  usersById: Map<string, PublicUser>,
  marketPrices: Map<string, CardMarketPrice>
): Trade {
  return {
    id: doc._id.toString(),
    code: doc.code,
    status: doc.status,
    revision: doc.revision,
    sides: doc.sides.map((side) => ({
      id: side.id,
      user: side.userId ? usersById.get(side.userId.toString()) ?? null : null,
      cards: (side.cards ?? []).map((card) => {
        const marketPrice = card.cardId && card.gameId ? marketPrices.get(`${card.gameId}|${card.cardId}`) : undefined;
        return marketPrice ? { ...card, marketPrice } : card;
      }),
      validatedAt: side.validatedAt ? side.validatedAt.toISOString() : null,
    })),
    createdBy: doc.createdBy.toString(),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    completedAt: doc.completedAt ? doc.completedAt.toISOString() : null,
    cancelledAt: doc.cancelledAt ? doc.cancelledAt.toISOString() : null,
  };
}

/**
 * Prix de marché d'un lot de cartes, indexés par `<jeu>|<carte>` — la clé porte
 * le jeu parce que deux jeux peuvent donner le même `cards.id`. Un seul
 * aller-retour par jeu, quel que soit le nombre de cartes.
 */
async function marketPricesForCards(
  cards: { cardId?: string; gameId?: string }[]
): Promise<Map<string, CardMarketPrice>> {
  const cardIdsByGame = new Map<string, Set<string>>();
  for (const card of cards) {
    if (!card.cardId || !card.gameId) continue;
    const cardIds = cardIdsByGame.get(card.gameId) ?? new Set<string>();
    cardIds.add(card.cardId);
    cardIdsByGame.set(card.gameId, cardIds);
  }

  const prices = new Map<string, CardMarketPrice>();
  for (const [gameId, cardIds] of cardIdsByGame) {
    const gamePrices = await getCardMarketPrices(new ObjectId(gameId), [...cardIds]);
    for (const [cardId, price] of gamePrices) {
      prices.set(`${gameId}|${cardId}`, price);
    }
  }

  return prices;
}

/** Prix de marché des cartes offertes dans un lot d'échanges. */
function marketPricesFor(docs: TradeDocument[]): Promise<Map<string, CardMarketPrice>> {
  return marketPricesForCards(docs.flatMap((doc) => doc.sides.flatMap((side) => side.cards ?? [])));
}

/** Résout en un seul appel les profils publics des participants d'un lot d'échanges. */
async function hydrateTrades(docs: TradeDocument[]): Promise<Trade[]> {
  const userIds = [
    ...new Set(docs.flatMap((doc) => doc.sides.map((side) => side.userId?.toString()).filter((id): id is string => !!id))),
  ];
  const [users, marketPrices] = await Promise.all([getUsersByIds(userIds), marketPricesFor(docs)]);
  const usersById = new Map(users.map((user) => [user.id, toPublicUser(user)]));
  return docs.map((doc) => toTrade(doc, usersById, marketPrices));
}

function sideOf(doc: TradeDocument, userId: string): TradeSideDocument | null {
  return doc.sides.find((side) => side.userId?.toString() === userId) ?? null;
}

function otherSide(doc: TradeDocument, side: TradeSideDocument): TradeSideDocument {
  return doc.sides.find((candidate) => candidate.id !== side.id)!;
}

/** Faces qui doivent valider pour que l'échange s'applique (celles occupées par un compte). */
function sidesRequiringValidation(doc: TradeDocument): TradeSideDocument[] {
  return doc.sides.filter((side) => !!side.userId);
}

export type TradeError =
  | "not-found"
  | "forbidden"
  | "closed"
  | "conflict"
  | "empty"
  | "side-taken"
  | "already-participant"
  | "self-trade"
  | "insufficient-copies"
  | "unknown-cards";

export type TradeActionResult<T = Trade> =
  | { ok: true; trade: T; applied?: boolean; joined?: boolean }
  | {
      ok: false;
      error: TradeError;
      details?: { name: string; setCode: string; collectorNumber: string; requested: number; owned: number }[];
      trade?: Trade;
    };

/** Crée un échange vide dont la contrepartie est libre. */
export async function createTrade(userId: string): Promise<Trade> {
  await tradeIndexesReady;

  const now = new Date();
  const userObjId = new ObjectId(userId);

  // Une collision de code est possible mais très improbable : on retente.
  for (let attempt = 0; attempt < 5; attempt++) {
    const doc: TradeDocument = {
      _id: new ObjectId(),
      code: generateTradeCode(),
      status: "open",
      revision: 0,
      sides: [
        { id: "a", userId: userObjId, cards: [], validatedAt: null },
        { id: "b", cards: [], validatedAt: null },
      ],
      createdBy: userObjId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.collection<TradeDocument>(TRADES_COLLECTION).insertOne(doc);
      return (await hydrateTrades([doc]))[0];
    } catch (error) {
      const isDuplicate = (error as { code?: number }).code === 11000;
      if (!isDuplicate || attempt === 4) throw error;
    }
  }

  throw new Error("Failed to generate a unique trade code");
}

async function findTradeDoc(tradeId: string): Promise<TradeDocument | null> {
  if (!ObjectId.isValid(tradeId)) return null;
  return db.collection<TradeDocument>(TRADES_COLLECTION).findOne({ _id: new ObjectId(tradeId) });
}

/** Échange lisible par l'utilisateur : il doit en être participant. */
export async function getTrade(tradeId: string, userId: string): Promise<Trade | null> {
  const doc = await findTradeDoc(tradeId);
  if (!doc || !sideOf(doc, userId)) return null;
  return (await hydrateTrades([doc]))[0];
}

/**
 * Échange désigné par son code d'invitation (QR code ou saisie manuelle) : le
 * code fait office de droit d'accès, comme pour les autres jointures de la
 * plateforme.
 */
export async function getTradeByCode(code: string): Promise<Trade | null> {
  if (!isValidTradeCode(code)) return null;
  const doc = await db.collection<TradeDocument>(TRADES_COLLECTION).findOne({ code });
  if (!doc) return null;
  return (await hydrateTrades([doc]))[0];
}

/** Échanges de l'utilisateur : en cours d'abord, puis l'historique (terminés ou annulés). */
export async function listUserTrades(
  userId: string,
  { historyLimit = 50 }: { historyLimit?: number } = {}
): Promise<{ open: Trade[]; past: Trade[] }> {
  const userObjId = new ObjectId(userId);
  const collection = db.collection<TradeDocument>(TRADES_COLLECTION);

  const [openDocs, pastDocs] = await Promise.all([
    collection
      .find({ "sides.userId": userObjId, status: "open" })
      .sort({ updatedAt: -1 })
      .toArray(),
    collection
      .find({ "sides.userId": userObjId, status: { $in: ["completed", "cancelled"] } })
      .sort({ updatedAt: -1 })
      .limit(historyLimit)
      .toArray(),
  ]);

  const trades = await hydrateTrades([...openDocs, ...pastDocs]);
  return { open: trades.slice(0, openDocs.length), past: trades.slice(openDocs.length) };
}

/** `unitPrice` à `null` efface le prix négocié et rend la main au prix de marché. */
export type TradeOwnedCardInput = {
  name: string;
  setCode: string;
  collectorNumber: string;
  quantity: number;
  unitPrice?: number | null;
};
export type TradeCatalogCardInput = { cardId: string; quantity: number; unitPrice?: number | null };

/**
 * Prix négocié retenu tel quel, aux centimes. Zéro en est un — une carte
 * offerte dans un échange se décide —, seul `null` rend la main au prix de
 * marché.
 */
function negotiatedPrice(unitPrice: number | null | undefined): { unitPrice: number } | undefined {
  return typeof unitPrice === "number" && unitPrice >= 0
    ? { unitPrice: Math.round(unitPrice * 100) / 100 }
    : undefined;
}

/**
 * Résout les cartes d'une offre depuis la collection de leur propriétaire : la
 * quantité est bornée aux exemplaires réellement possédés et les cartes non
 * possédées sont écartées. Le snapshot stocké vient donc toujours de la base,
 * jamais du client.
 */
async function resolveOwnedCards(
  userObjId: ObjectId,
  items: TradeOwnedCardInput[]
): Promise<TradeCardSnapshot[]> {
  const merged = new Map<string, TradeOwnedCardInput>();
  for (const item of items) {
    const key = cardKey(item.name, item.setCode, item.collectorNumber);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      existing.unitPrice = existing.unitPrice ?? item.unitPrice;
    } else {
      merged.set(key, { ...item });
    }
  }
  const requested = [...merged.values()].slice(0, TRADE_MAX_CARDS_PER_SIDE);
  if (requested.length === 0) return [];

  const names = [...new Set(requested.map((item) => item.name))];
  const rows = await db
    .collection("collection-cards")
    .aggregate<{
      _id: { name: string; setCode: string; collectorNumber: string };
      cardId?: string;
      image?: string;
      owned: number;
    }>([
      { $match: { userId: userObjId, name: { $in: names } } },
      {
        $group: {
          _id: { name: "$name", setCode: "$setCode", collectorNumber: { $toString: "$collectorNumber" } },
          cardId: { $first: "$cardId" },
          image: { $first: "$image" },
          owned: { $sum: 1 },
        },
      },
    ])
    .toArray();

  const ownedByKey = new Map(
    rows.map((row) => [cardKey(row._id.name, row._id.setCode, row._id.collectorNumber), row])
  );

  const gamesByCardId = await getGamesByCardIds(
    rows.map((row) => row.cardId).filter((id): id is string => !!id)
  );

  const snapshots: TradeCardSnapshot[] = [];
  for (const item of requested) {
    const key = cardKey(item.name, item.setCode, item.collectorNumber);
    const owned = ownedByKey.get(key);
    if (!owned || owned.owned <= 0) continue;

    const game = owned.cardId ? gamesByCardId.get(owned.cardId) : undefined;
    snapshots.push({
      cardId: owned.cardId,
      name: item.name,
      setCode: item.setCode,
      collectorNumber: item.collectorNumber,
      image: owned.image ?? "",
      gameId: game?.id,
      gameName: game?.name,
      gameSlug: game?.slug,
      quantity: Math.max(1, Math.min(owned.owned, Math.min(TRADE_MAX_QUANTITY, item.quantity))),
      ...negotiatedPrice(item.unitPrice),
    });
  }

  return snapshots;
}

/** Résout les cartes d'une offre libre depuis le catalogue, par `cards.id`. */
async function resolveCatalogCards(
  items: TradeCatalogCardInput[]
): Promise<{ snapshots: TradeCardSnapshot[]; unknown: string[] }> {
  const merged = new Map<string, TradeCatalogCardInput>();
  for (const item of items) {
    const existing = merged.get(item.cardId);
    if (existing) {
      existing.quantity += item.quantity;
      existing.unitPrice = existing.unitPrice ?? item.unitPrice;
    } else {
      merged.set(item.cardId, { ...item });
    }
  }
  const requested = [...merged.values()].slice(0, TRADE_MAX_CARDS_PER_SIDE);
  if (requested.length === 0) return { snapshots: [], unknown: [] };

  const cards = await db
    .collection("cards")
    .find(
      { id: { $in: requested.map((item) => item.cardId) } },
      { projection: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, poster: 1, gameId: 1 } }
    )
    .toArray();

  const byId = new Map<string, Record<string, unknown>>();
  for (const card of cards) {
    // `cards.id` n'est pas strictement unique : la première impression suffit.
    if (!byId.has(card.id as string)) byId.set(card.id as string, card);
  }

  const gameIds = [...new Set(cards.map((card) => card.gameId).filter((id): id is ObjectId => id instanceof ObjectId))];
  const gamesMeta = await getGamesMeta(gameIds);

  const snapshots: TradeCardSnapshot[] = [];
  const unknown: string[] = [];
  for (const item of requested) {
    const card = byId.get(item.cardId);
    if (!card) {
      unknown.push(item.cardId);
      continue;
    }
    const gameId = card.gameId instanceof ObjectId ? card.gameId.toString() : undefined;
    snapshots.push({
      cardId: card.id as string,
      name: card.name as string,
      setCode: card.setCode as string,
      collectorNumber: String(card.collectorNumber ?? ""),
      image: ((card.image ?? card.poster) as string | undefined) ?? "",
      gameId,
      gameName: gameId ? gamesMeta.get(gameId)?.name : undefined,
      gameSlug: gameId ? gamesMeta.get(gameId)?.slug : undefined,
      quantity: Math.max(1, Math.min(TRADE_MAX_QUANTITY, item.quantity)),
      ...negotiatedPrice(item.unitPrice),
    });
  }

  return { snapshots, unknown };
}

/** Jeu d'appartenance d'un lot de cartes du catalogue, indexé par `cards.id`. */
async function getGamesByCardIds(cardIds: string[]): Promise<Map<string, TradeGame>> {
  const ids = [...new Set(cardIds)];
  if (ids.length === 0) return new Map();

  const cards = await db
    .collection("cards")
    .find({ id: { $in: ids } }, { projection: { _id: 0, id: 1, gameId: 1 } })
    .toArray();

  const gameIds = [...new Set(cards.map((card) => card.gameId).filter((id): id is ObjectId => id instanceof ObjectId))];
  const gamesMeta = await getGamesMeta(gameIds);

  const result = new Map<string, TradeGame>();
  for (const card of cards) {
    const gameId = card.gameId instanceof ObjectId ? card.gameId.toString() : null;
    const game = gameId ? gamesMeta.get(gameId) : null;
    if (game && !result.has(card.id as string)) result.set(card.id as string, game);
  }
  return result;
}

/**
 * Remplace le contenu d'une offre.
 *
 * `target` vaut `mine` pour sa propre face, ou `counterparty` pour la face libre
 * d'un échange sans partenaire (le créateur y décrit ce qu'il reçoit). Toute
 * modification annule les validations en cours.
 */
export async function setTradeSideCards({
  tradeId,
  userId,
  target,
  cards,
}: {
  tradeId: string;
  userId: string;
  target: "mine" | "counterparty";
  cards: (TradeOwnedCardInput | TradeCatalogCardInput)[];
}): Promise<TradeActionResult> {
  // L'écriture est gardée par `revision` : une modification concurrente de
  // l'autre face fait échouer la mise à jour, qu'on rejoue sur l'état frais.
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await findTradeDoc(tradeId);
    if (!doc) return { ok: false, error: "not-found" };

    const mine = sideOf(doc, userId);
    if (!mine) return { ok: false, error: "forbidden" };
    if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };

    const side = target === "mine" ? mine : otherSide(doc, mine);
    if (target === "counterparty" && side.userId) {
      // La face appartient au partenaire : lui seul peut la modifier.
      return { ok: false, error: "forbidden" };
    }

    let snapshots: TradeCardSnapshot[];
    if (side.userId) {
      snapshots = await resolveOwnedCards(side.userId, cards as TradeOwnedCardInput[]);
    } else {
      const resolved = await resolveCatalogCards(cards as TradeCatalogCardInput[]);
      if (resolved.unknown.length > 0) {
        return { ok: false, error: "unknown-cards" };
      }
      snapshots = resolved.snapshots;
    }

    const sides = doc.sides.map((candidate) => ({
      ...candidate,
      cards: candidate.id === side.id ? snapshots : candidate.cards,
      validatedAt: null,
    }));

    const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
      { _id: doc._id, status: "open", revision: doc.revision, applying: { $ne: true } },
      { $set: { sides, revision: doc.revision + 1, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (result) {
      return { ok: true, trade: (await hydrateTrades([result]))[0] };
    }
  }

  return { ok: false, error: "conflict" };
}

/** Installe un partenaire sur la face libre (invitation par tag ou e-mail). */
export async function setTradePartner({
  tradeId,
  userId,
  partnerUserId,
}: {
  tradeId: string;
  userId: string;
  partnerUserId: string;
}): Promise<TradeActionResult> {
  const doc = await findTradeDoc(tradeId);
  if (!doc) return { ok: false, error: "not-found" };
  if (doc.createdBy.toString() !== userId) return { ok: false, error: "forbidden" };
  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };
  if (partnerUserId === userId) return { ok: false, error: "self-trade" };

  const free = doc.sides.find((side) => !side.userId);
  if (!free) return { ok: false, error: "side-taken" };

  const sides = doc.sides.map((side) =>
    side.id === free.id
      ? // Les cartes décrites pour un partenaire inconnu n'ont plus de sens : c'est
        // à lui de composer son offre.
        { ...side, userId: new ObjectId(partnerUserId), cards: [], validatedAt: null }
      : { ...side, validatedAt: null }
  );

  const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", revision: doc.revision, applying: { $ne: true } },
    { $set: { sides, revision: doc.revision + 1, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) return { ok: false, error: "conflict" };
  return { ok: true, trade: (await hydrateTrades([result]))[0] };
}

/**
 * Libère la face du partenaire. Le créateur peut retirer son partenaire, et le
 * partenaire peut quitter l'échange lui-même.
 */
export async function removeTradePartner({
  tradeId,
  userId,
}: {
  tradeId: string;
  userId: string;
}): Promise<TradeActionResult> {
  const doc = await findTradeDoc(tradeId);
  if (!doc) return { ok: false, error: "not-found" };
  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };

  const partnerSide = doc.sides.find((side) => side.userId && side.userId.toString() !== doc.createdBy.toString());
  if (!partnerSide) return { ok: false, error: "not-found" };

  const isCreator = doc.createdBy.toString() === userId;
  const isPartner = partnerSide.userId?.toString() === userId;
  if (!isCreator && !isPartner) return { ok: false, error: "forbidden" };

  // `sides` est réécrit en entier : la face libérée est reconstruite sans
  // `userId`, ce qui la remet à l'état « contrepartie libre ».
  const sides: TradeSideDocument[] = doc.sides.map((side) =>
    side.id === partnerSide.id
      ? { id: side.id, cards: [], validatedAt: null }
      : { ...side, validatedAt: null }
  );

  const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", revision: doc.revision, applying: { $ne: true } },
    { $set: { sides, revision: doc.revision + 1, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) return { ok: false, error: "conflict" };
  return { ok: true, trade: (await hydrateTrades([result]))[0] };
}

/** Rejoint un échange à partir de son code d'invitation. */
export async function joinTradeByCode({
  code,
  userId,
}: {
  code: string;
  userId: string;
}): Promise<TradeActionResult> {
  if (!isValidTradeCode(code)) return { ok: false, error: "not-found" };

  const doc = await db.collection<TradeDocument>(TRADES_COLLECTION).findOne({ code });
  if (!doc) return { ok: false, error: "not-found" };

  // Déjà participant : la jointure est idempotente, on renvoie l'échange sans
  // le signaler comme une arrivée (sinon rouvrir le lien renotifierait l'hôte).
  if (sideOf(doc, userId)) {
    return { ok: true, trade: (await hydrateTrades([doc]))[0], joined: false };
  }

  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };

  const free = doc.sides.find((side) => !side.userId);
  if (!free) return { ok: false, error: "side-taken" };

  const sides = doc.sides.map((side) =>
    side.id === free.id
      ? { ...side, userId: new ObjectId(userId), cards: [], validatedAt: null }
      : { ...side, validatedAt: null }
  );

  const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", revision: doc.revision, applying: { $ne: true } },
    { $set: { sides, revision: doc.revision + 1, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  // Course perdue : quelqu'un d'autre a pris la place entre-temps.
  if (!result) return { ok: false, error: "side-taken" };
  return { ok: true, trade: (await hydrateTrades([result]))[0], joined: true };
}

/** Retire sa propre validation (par exemple pour retoucher son offre). */
export async function revokeTradeValidation({
  tradeId,
  userId,
}: {
  tradeId: string;
  userId: string;
}): Promise<TradeActionResult> {
  const doc = await findTradeDoc(tradeId);
  if (!doc) return { ok: false, error: "not-found" };

  const mine = sideOf(doc, userId);
  if (!mine) return { ok: false, error: "forbidden" };
  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };

  const index = doc.sides.indexOf(mine);
  const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", applying: { $ne: true } },
    { $set: { [`sides.${index}.validatedAt`]: null, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result) return { ok: false, error: "conflict" };
  return { ok: true, trade: (await hydrateTrades([result]))[0] };
}

/** Annule un échange en cours. Accessible à ses deux participants. */
export async function cancelTrade({
  tradeId,
  userId,
}: {
  tradeId: string;
  userId: string;
}): Promise<TradeActionResult> {
  const doc = await findTradeDoc(tradeId);
  if (!doc) return { ok: false, error: "not-found" };
  if (!sideOf(doc, userId)) return { ok: false, error: "forbidden" };
  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };

  const now = new Date();
  const result = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", applying: { $ne: true } },
    { $set: { status: "cancelled", cancelledAt: now, cancelledBy: new ObjectId(userId), updatedAt: now } },
    { returnDocument: "after" }
  );

  if (!result) return { ok: false, error: "conflict" };
  return { ok: true, trade: (await hydrateTrades([result]))[0] };
}

/**
 * Valide sa face de l'échange. Lorsque toutes les faces occupées par un compte
 * sont validées, l'échange est appliqué immédiatement aux collections.
 *
 * `revision` est la version de l'échange que le client avait sous les yeux : on
 * refuse de valider un contenu modifié depuis.
 */
export async function validateTradeSide({
  tradeId,
  userId,
  revision,
}: {
  tradeId: string;
  userId: string;
  revision: number;
}): Promise<TradeActionResult> {
  const doc = await findTradeDoc(tradeId);
  if (!doc) return { ok: false, error: "not-found" };

  const mine = sideOf(doc, userId);
  if (!mine) return { ok: false, error: "forbidden" };
  if (doc.status !== "open" || doc.applying) return { ok: false, error: "closed" };
  if (doc.revision !== revision) {
    return { ok: false, error: "conflict", trade: (await hydrateTrades([doc]))[0] };
  }
  if (doc.sides.every((side) => (side.cards ?? []).length === 0)) {
    return { ok: false, error: "empty" };
  }

  const index = doc.sides.indexOf(mine);
  const validated = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id, status: "open", revision, applying: { $ne: true } },
    { $set: { [`sides.${index}.validatedAt`]: new Date(), updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!validated) return { ok: false, error: "conflict" };

  const everyoneValidated = sidesRequiringValidation(validated).every((side) => !!side.validatedAt);
  if (!everyoneValidated) {
    return { ok: true, trade: (await hydrateTrades([validated]))[0], applied: false };
  }

  // Pose du verrou : seule la requête qui l'obtient applique l'échange, même si
  // les deux participants valident au même instant. Le filtre réaffirme que
  // toutes les faces concernées sont encore validées : une révocation glissée
  // entre la lecture ci-dessus et la pose du verrou ne change pas la révision,
  // et appliquerait sinon un échange qui ne l'est plus.
  const claimFilter: Record<string, unknown> = {
    _id: doc._id,
    status: "open",
    revision,
    applying: { $ne: true },
  };
  for (const side of sidesRequiringValidation(validated)) {
    claimFilter[`sides.${validated.sides.indexOf(side)}.validatedAt`] = { $ne: null };
  }

  const claimed = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    claimFilter,
    { $set: { applying: true } },
    { returnDocument: "after" }
  );

  if (!claimed) {
    // Soit une autre requête applique déjà l'échange, soit il n'est plus
    // entièrement validé : on renvoie l'état frais plutôt que celui qu'on
    // venait de lire.
    const current = (await findTradeDoc(tradeId)) ?? validated;
    return { ok: true, trade: (await hydrateTrades([current]))[0], applied: false };
  }

  let applyResult: TradeApplyResult;
  try {
    applyResult = await applyTrade(claimed);
  } catch (error) {
    await db
      .collection<TradeDocument>(TRADES_COLLECTION)
      .updateOne({ _id: doc._id }, { $unset: { applying: "" } });
    throw error;
  }

  if (!applyResult.ok) {
    // Le stock a changé depuis la composition de l'offre : l'échange redevient
    // modifiable, validations remises à zéro.
    const reopened = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
      { _id: doc._id },
      {
        $set: {
          "sides.0.validatedAt": null,
          "sides.1.validatedAt": null,
          revision: claimed.revision + 1,
          updatedAt: new Date(),
        },
        $unset: { applying: "" },
      },
      { returnDocument: "after" }
    );

    return {
      ok: false,
      error: "insufficient-copies",
      details: applyResult.details,
      trade: reopened ? (await hydrateTrades([reopened]))[0] : undefined,
    };
  }

  const now = new Date();
  const completed = await db.collection<TradeDocument>(TRADES_COLLECTION).findOneAndUpdate(
    { _id: doc._id },
    { $set: { status: "completed", completedAt: now, updatedAt: now }, $unset: { applying: "" } },
    { returnDocument: "after" }
  );

  return { ok: true, trade: (await hydrateTrades([completed ?? claimed]))[0], applied: true };
}

type TradeApplyResult =
  | { ok: true; removed: number; added: number }
  | {
      ok: false;
      error: "insufficient-copies";
      details: { name: string; setCode: string; collectorNumber: string; requested: number; owned: number }[];
    };

/**
 * Applique l'échange aux collections : chaque face occupée par un compte perd
 * les cartes qu'elle cède et reçoit celles de la face d'en face.
 *
 * Tout est vérifié avant la moindre écriture (les exemplaires cédés doivent
 * toujours être possédés). MongoDB pouvant tourner en standalone (développement
 * local), où les transactions ne sont pas disponibles, les insertions précèdent
 * les suppressions et sont annulées si celles-ci échouent : une erreur ne peut
 * pas faire disparaître de cartes.
 */
async function applyTrade(doc: TradeDocument): Promise<TradeApplyResult> {
  const userSides = doc.sides.filter((side) => !!side.userId);

  // --- Exemplaires précis à retirer, par face ---
  const entriesToRemove: ObjectId[] = [];
  const ownerIds: ObjectId[] = [];
  const insufficient: Extract<TradeApplyResult, { ok: false }>["details"] = [];

  for (const side of userSides) {
    const ownerId = side.userId!;
    ownerIds.push(ownerId);

    for (const card of side.cards ?? []) {
      const entries = await db
        .collection("collection-cards")
        .find(
          {
            userId: ownerId,
            name: card.name,
            setCode: card.setCode,
            // Quelques entrées historiques stockent un numéro de collecteur
            // numérique, alors que les offres portent toujours une chaîne.
            $expr: { $eq: [{ $toString: "$collectorNumber" }, card.collectorNumber] },
          },
          { projection: { _id: 1, borrowedBy: 1 } }
        )
        .toArray();

      if (entries.length < card.quantity) {
        insufficient.push({
          name: card.name,
          setCode: card.setCode,
          collectorNumber: card.collectorNumber,
          requested: card.quantity,
          owned: entries.length,
        });
        continue;
      }

      // Les exemplaires prêtés partent en dernier : un échange porte en priorité
      // sur des cartes effectivement en main.
      entries.sort((a, b) => Number(Boolean(a.borrowedBy)) - Number(Boolean(b.borrowedBy)));
      entriesToRemove.push(...entries.slice(0, card.quantity).map((entry) => entry._id));
    }
  }

  if (insufficient.length > 0) {
    return { ok: false, error: "insufficient-copies", details: insufficient };
  }

  // --- Exemplaires à ajouter : ce que cède la face d'en face ---
  const obtainedAt = DateTime.now().toISODate() ?? undefined;
  const documents = userSides.flatMap((side) => {
    const received = otherSide(doc, side).cards ?? [];
    return received.flatMap((card) =>
      Array.from({ length: card.quantity }, () => ({
        ...(card.cardId ? { cardId: card.cardId } : {}),
        name: card.name,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        image: card.image,
        userId: side.userId!,
        ...(obtainedAt ? { obtainedAt } : {}),
      }))
    );
  });

  let insertedIds: ObjectId[] = [];
  if (documents.length > 0) {
    const insertResult = await db.collection("collection-cards").insertMany(documents);
    insertedIds = Object.values(insertResult.insertedIds);
  }

  try {
    if (entriesToRemove.length > 0) {
      await db
        .collection("collection-cards")
        .deleteMany({ userId: { $in: ownerIds }, _id: { $in: entriesToRemove } });
    }
  } catch (error) {
    if (insertedIds.length > 0) {
      await db
        .collection("collection-cards")
        .deleteMany({ _id: { $in: insertedIds } })
        .catch((cleanupError) => console.error("Failed to roll back traded-in cards:", cleanupError));
    }
    throw error;
  }

  // Une carte cédée ne peut plus être proposée à la vente. Nettoyage au mieux :
  // les exemplaires sont déjà retirés à ce stade, l'échange n'est plus annulable,
  // et un échec ici ne doit donc pas le faire échouer.
  if (entriesToRemove.length > 0) {
    await removeSellListItemsByCollectionEntryIds(entriesToRemove).catch((error) =>
      console.error("Failed to unlist traded-away cards:", error)
    );
  }

  return { ok: true, removed: entriesToRemove.length, added: documents.length };
}
