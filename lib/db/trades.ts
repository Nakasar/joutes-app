import 'server-only';
import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { DateTime } from "luxon";
import { removeSellListItemsByCollectionEntryIds } from "@/lib/db/sell-lists";

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

/** Le catalogue couvre tous les jeux : une recherche trop courte n'est pas exécutée. */
export const TRADE_CATALOG_MIN_QUERY = 2;

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

  const items: TradeCard[] = rawItems.map((it) => {
    const key = cardKey(it.name, it.setCode, it.collectorNumber);
    const game = it.gameId ? gamesMeta.get(it.gameId) : undefined;

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

export type TradeOfferedItem = { name: string; setCode: string; collectorNumber: string; quantity: number };
export type TradeReceivedItem = { cardId: string; quantity: number };

export type TradeResult =
  | { ok: true; removed: number; added: number }
  | {
      ok: false;
      error: "insufficient-copies";
      details: { name: string; setCode: string; collectorNumber: string; requested: number; owned: number }[];
    }
  | { ok: false; error: "unknown-cards"; details: string[] };

/** Additionne les quantités des lignes portant sur la même impression. */
function mergeOffered(offered: TradeOfferedItem[]): TradeOfferedItem[] {
  const merged = new Map<string, TradeOfferedItem>();
  for (const item of offered) {
    const key = cardKey(item.name, item.setCode, item.collectorNumber);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, { ...item });
    }
  }
  return [...merged.values()];
}

function mergeReceived(received: TradeReceivedItem[]): TradeReceivedItem[] {
  const merged = new Map<string, TradeReceivedItem>();
  for (const item of received) {
    const existing = merged.get(item.cardId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(item.cardId, { ...item });
    }
  }
  return [...merged.values()];
}

/**
 * Applique un échange sur la collection de l'utilisateur : retire les
 * exemplaires cédés, ajoute les exemplaires reçus.
 *
 * Les deux faces sont entièrement validées avant la moindre écriture (cartes
 * reçues présentes au catalogue, exemplaires cédés réellement possédés).
 */
export async function executeTrade({
  userId,
  offered,
  received,
}: {
  userId: string;
  offered: TradeOfferedItem[];
  received: TradeReceivedItem[];
}): Promise<TradeResult> {
  const userObjId = new ObjectId(userId);
  const offeredItems = mergeOffered(offered);
  const receivedItems = mergeReceived(received);

  // --- Cartes reçues : les données insérées viennent du catalogue, jamais du client ---
  const receivedIds = receivedItems.map((item) => item.cardId);
  const catalogCards = receivedIds.length
    ? await db
        .collection("cards")
        .find(
          { id: { $in: receivedIds } },
          { projection: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1, poster: 1 } }
        )
        .toArray()
    : [];

  const catalogById = new Map<string, Record<string, unknown>>();
  for (const card of catalogCards) {
    // `cards.id` n'est pas strictement unique : la première impression suffit.
    if (!catalogById.has(card.id as string)) catalogById.set(card.id as string, card);
  }

  const unknownCards = receivedIds.filter((id) => !catalogById.has(id));
  if (unknownCards.length > 0) {
    return { ok: false, error: "unknown-cards", details: unknownCards };
  }

  // --- Cartes cédées : on choisit les exemplaires précis à supprimer ---
  const entriesToRemove: ObjectId[] = [];
  const insufficient: Extract<TradeResult, { error: "insufficient-copies" }>["details"] = [];

  for (const item of offeredItems) {
    const entries = await db
      .collection("collection-cards")
      .find(
        {
          userId: userObjId,
          name: item.name,
          setCode: item.setCode,
          // Quelques entrées historiques stockent un numéro de collecteur
          // numérique, alors que la recherche renvoie toujours une chaîne.
          $expr: { $eq: [{ $toString: "$collectorNumber" }, item.collectorNumber] },
        },
        { projection: { _id: 1, borrowedBy: 1 } }
      )
      .toArray();

    if (entries.length < item.quantity) {
      insufficient.push({
        name: item.name,
        setCode: item.setCode,
        collectorNumber: item.collectorNumber,
        requested: item.quantity,
        owned: entries.length,
      });
      continue;
    }

    // Les exemplaires prêtés partent en dernier : un échange porte en priorité
    // sur des cartes effectivement en main.
    entries.sort((a, b) => Number(Boolean(a.borrowedBy)) - Number(Boolean(b.borrowedBy)));
    entriesToRemove.push(...entries.slice(0, item.quantity).map((entry) => entry._id));
  }

  if (insufficient.length > 0) {
    return { ok: false, error: "insufficient-copies", details: insufficient };
  }

  const obtainedAt = DateTime.now().toISODate() ?? undefined;
  const documents = receivedItems.flatMap((item) => {
    const card = catalogById.get(item.cardId)!;
    return Array.from({ length: item.quantity }, () => ({
      cardId: card.id as string,
      name: card.name as string,
      setCode: card.setCode as string,
      collectorNumber: String(card.collectorNumber ?? ""),
      image: ((card.image ?? card.poster) as string | undefined) ?? "",
      userId: userObjId,
      ...(obtainedAt ? { obtainedAt } : {}),
    }));
  });

  // MongoDB peut tourner en standalone (développement local), où les
  // transactions ne sont pas disponibles : on insère avant de retirer et on
  // annule les insertions si le retrait échoue, pour qu'une erreur ne puisse
  // jamais faire disparaître des cartes de la collection.
  let insertedIds: ObjectId[] = [];
  if (documents.length > 0) {
    const insertResult = await db.collection("collection-cards").insertMany(documents);
    insertedIds = Object.values(insertResult.insertedIds);
  }

  try {
    if (entriesToRemove.length > 0) {
      await db.collection("collection-cards").deleteMany({ userId: userObjId, _id: { $in: entriesToRemove } });
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
