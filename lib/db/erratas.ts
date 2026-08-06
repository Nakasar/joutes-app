import 'server-only';

import db from "@/lib/mongodb";
import {
  Errata,
  ErrataDb,
  ErrataType,
  ErrataVoteDb,
  ErrataVoteType,
  MAX_ERRATA_CARDS,
} from "@/lib/types/errata";
import { Locale } from "@/i18n/config";
import { ObjectId } from "bson";

type ErrataAggregateResult = ErrataDb & {
  _id: ObjectId;
  // Legacy scalar field, still present on documents not yet migrated by
  // scripts/migrate-errata-cardid-to-cardids.ts.
  cardId?: string;
  cards?: Errata['cards'];
  votesList?: { userId: ObjectId; vote: string }[];
};

function toErrata(errata: ErrataAggregateResult, userId?: string): Errata {
  return {
    id: errata._id.toString(),
    cardIds: errata.cardIds?.length ? errata.cardIds : (errata.cardId ? [errata.cardId] : []),
    cards: errata.cards,
    type: errata.type,
    details: errata.details,
    originalLang: errata.originalLang ?? "fr",
    contentUpdatedAt: errata.contentUpdatedAt ?? errata.createdAt,
    translations: errata.translations,
    source: errata.source,
    errataDate: errata.errataDate,
    createdBy: errata.createdBy.toString(),
    createdAt: errata.createdAt,
    deprecatedAt: errata.deprecatedAt,
    votes: {
      positive: (errata.votesList ?? []).filter((v) => v.vote === 'positive').length,
      negative: (errata.votesList ?? []).filter((v) => v.vote === 'negative').length,
      userVote: userId
        ? (errata.votesList ?? []).find((v) => v.userId.toString() === userId)?.vote as Errata['votes']['userVote']
        : undefined,
    },
  };
}

async function getGameCardIds(gameId: ObjectId): Promise<string[]> {
  const cards = await db.collection<{ id: string }>("cards").find({ gameId }, { projection: { _id: 0, id: 1 } }).toArray();
  return cards.map((c) => c.id);
}

// Matches both the current `cardIds` array field and the legacy scalar `cardId`
// field, so erratas still keep working during the deployment window before
// `scripts/migrate-errata-cardid-to-cardids.ts` has run against the database.
function buildErrataCardIdsMatchFilter(cardIds: string[]): Record<string, unknown> {
  return { $or: [{ cardIds: { $in: cardIds } }, { cardId: { $in: cardIds } }] };
}

export async function countErratasByGameId(gameId: string): Promise<number> {
  const cardIds = await getGameCardIds(new ObjectId(gameId));
  if (cardIds.length === 0) return 0;

  return db.collection<ErrataDb>("erratas").countDocuments(buildErrataCardIdsMatchFilter(cardIds));
}

export async function getErratasByGameId({
                                            gameId,
                                            offset = 0,
                                            limit = 20,
                                            userId,
                                            sortOrder = "asc",
                                          }: {
  gameId: string;
  offset?: number;
  limit?: number;
  userId?: string;
  sortOrder?: "asc" | "desc";
}): Promise<Errata[]> {
  const cardIds = await getGameCardIds(new ObjectId(gameId));
  if (cardIds.length === 0) return [];

  const sortDir = sortOrder === "asc" ? 1 : -1;

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: buildErrataCardIdsMatchFilter(cardIds) },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, gameId: 0 } },
          ],
        },
      },
      // `$min` (rather than `$arrayElemAt: [..., 0]`) keeps the sort deterministic:
      // `$lookup` does not guarantee element order for a `cardIds` array match.
      { $addFields: { primaryCardName: { $min: '$cards.name' } } },
      { $sort: { primaryCardName: sortDir as 1 | -1, errataDate: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}

export async function getErratasByCardId(cardId: string, userId?: string): Promise<Errata[]> {
  const card = await db.collection("cards").findOne({ id: cardId });
  const matchingCardIds = card
    ? await db.collection('cards').find({ name: card.name }, { projection: { id: 1 } }).toArray()
    : null;

  // Matches both the current `cardIds` array field and the legacy scalar `cardId`
  // field, so erratas still keep working during the deployment window before
  // `scripts/migrate-errata-cardid-to-cardids.ts` has run against the database.
  const matchFilter = matchingCardIds
    ? {
        $or: [
          { cardIds: { $in: matchingCardIds.map((i) => i.id) } },
          { cardId: { $in: matchingCardIds.map((i) => i.id) } },
        ],
      }
    : { $or: [{ cardIds: cardId }, { cardId }] };

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, id: 1, name: 1, setCode: 1, collectorNumber: 1, image: 1 } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}

async function buildErrataMatchFilter({
                                        search,
                                        type,
                                      }: {
  search?: string;
  type?: ErrataType | "all";
}): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  if (type && type !== "all") {
    filter.type = type;
  }

  if (search?.trim()) {
    const matchingCards = await db
      .collection("cards")
      .find({ name: { $regex: search.trim(), $options: "i" } }, { projection: { id: 1 } })
      .toArray();
    const ids = matchingCards.map((c) => c.id);
    // Same legacy `cardId` fallback as getErratasByCardId, see comment there.
    filter.$or = [{ cardIds: { $in: ids } }, { cardId: { $in: ids } }];
  }

  return filter;
}

export async function countAllErratas({
                                        search,
                                        type,
                                      }: { search?: string; type?: ErrataType | "all" } = {}): Promise<number> {
  const filter = await buildErrataMatchFilter({ search, type });
  return db.collection<ErrataDb>("erratas").countDocuments(filter);
}

export async function getAllErratas({
                                      offset = 0,
                                      limit = 50,
                                      userId,
                                      search,
                                      type,
                                      sortOrder = "asc",
                                    }: {
  offset?: number;
  limit?: number;
  userId?: string;
  search?: string;
  type?: ErrataType | "all";
  sortOrder?: "asc" | "desc";
}): Promise<Errata[]> {
  const matchFilter = await buildErrataMatchFilter({ search, type });
  const sortDir = sortOrder === "asc" ? 1 : -1;

  const erratasDb = await db
    .collection<ErrataDb>("erratas")
    .aggregate<ErrataAggregateResult>([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'cards',
          localField: 'cardIds',
          foreignField: 'id',
          as: 'cards',
          pipeline: [
            { $project: { _id: 0, gameId: 0 } },
          ],
        },
      },
      // `$min` (rather than `$arrayElemAt: [..., 0]`) keeps the sort deterministic:
      // `$lookup` does not guarantee element order for a `cardIds` array match.
      { $addFields: { primaryCardName: { $min: '$cards.name' } } },
      { $sort: { primaryCardName: sortDir as 1 | -1, errataDate: -1 } },
      { $skip: offset },
      { $limit: limit },
      {
        $lookup: {
          from: 'errata-votes',
          localField: '_id',
          foreignField: 'errataId',
          as: 'votesList',
        },
      },
    ])
    .toArray();

  return erratasDb.map((errata) => toErrata(errata, userId));
}

/**
 * Erreur de saisie côté appelant (contenu manquant, cartes inconnues…), par
 * opposition à une panne serveur : les routes HTTP la traduisent en 400 plutôt
 * qu'en 500.
 */
export class ErrataInputError extends Error {}

/**
 * Normalise et valide les cartes d'un errata : au moins une carte, pas plus de
 * `MAX_ERRATA_CARDS`, et uniquement des cartes existantes. `gameId` restreint
 * en plus les cartes à ce jeu, ce dont les routes `/games/{gameId}/erratas` ont
 * besoin pour que le jeu du chemin ne soit pas purement décoratif.
 */
export async function checkErrataCardIds(cardIds: string[], gameId?: string): Promise<string[]> {
  const uniqueCardIds = [...new Set(cardIds)];

  if (uniqueCardIds.length === 0) {
    throw new ErrataInputError("Un errata doit être lié à au moins une carte.");
  }

  if (uniqueCardIds.length > MAX_ERRATA_CARDS) {
    throw new ErrataInputError(`Un errata ne peut pas être lié à plus de ${MAX_ERRATA_CARDS} cartes.`);
  }

  const filter: Record<string, unknown> = { id: { $in: uniqueCardIds } };
  if (gameId) {
    filter.gameId = new ObjectId(gameId);
  }

  const knownCardIds = await db.collection("cards").distinct("id", filter);
  if (knownCardIds.length !== uniqueCardIds.length) {
    throw new ErrataInputError(
      gameId
        ? "Un errata ne peut être lié qu'à des cartes existantes de ce jeu."
        : "Un errata ne peut être lié qu'à des cartes existantes.",
    );
  }

  return uniqueCardIds;
}

/**
 * Insère un errata. La création est ouverte à tout utilisateur connecté : les
 * erratas sont un contenu communautaire, arbitré par les votes et les
 * signalements. Renvoie les cartes retenues, que l'appelant utilise pour
 * revalider les pages concernées.
 */
export async function createErrata(data: {
  cardIds: string[];
  type: ErrataType;
  details: string;
  originalLang: Locale;
  source?: string;
  errataDate: Date;
  createdBy: string;
  /** Restreint les cartes visées à ce jeu. */
  gameId?: string;
}): Promise<{ id: string; cardIds: string[] }> {
  if (!data.details.trim()) {
    throw new ErrataInputError("Le contenu de l'errata est requis.");
  }

  const cardIds = await checkErrataCardIds(data.cardIds, data.gameId);

  const now = new Date();
  const errata: ErrataDb = {
    cardIds,
    type: data.type,
    details: data.details,
    originalLang: data.originalLang,
    contentUpdatedAt: now,
    source: data.source,
    errataDate: data.errataDate,
    createdBy: new ObjectId(data.createdBy),
    createdAt: now,
  };

  const result = await db.collection<ErrataDb>("erratas").insertOne(errata);

  return { id: result.insertedId.toString(), cardIds };
}

/**
 * Pose, change ou retire le vote d'un utilisateur sur un errata — revoter à
 * l'identique retire le vote. Renvoie le décompte à jour, ou `null` si
 * l'errata n'existe pas.
 */
export async function voteOnErrata(
  errataId: string,
  userId: string,
  vote: ErrataVoteType,
): Promise<Errata["votes"] | null> {
  if (!ObjectId.isValid(errataId)) {
    return null;
  }

  const errataObjId = new ObjectId(errataId);
  const errata = await db.collection<ErrataDb>("erratas").findOne({ _id: errataObjId });
  if (!errata) {
    return null;
  }

  const userObjId = new ObjectId(userId);
  const votes = db.collection<ErrataVoteDb>("errata-votes");
  const existing = await votes.findOne({ errataId: errataObjId, userId: userObjId });

  if (existing && existing.vote === vote) {
    await votes.deleteOne({ errataId: errataObjId, userId: userObjId });
  } else {
    await votes.updateOne(
      { errataId: errataObjId, userId: userObjId },
      { $set: { vote, createdAt: new Date() } },
      { upsert: true },
    );
  }

  const remaining = await votes.find({ errataId: errataObjId }).toArray();

  return {
    positive: remaining.filter((v) => v.vote === "positive").length,
    negative: remaining.filter((v) => v.vote === "negative").length,
    userVote: remaining.find((v) => v.userId.toString() === userId)?.vote,
  };
}

/**
 * Suppression d'un errata et de ses votes (modération).
 */
export async function deleteErrataById(errataId: string): Promise<boolean> {
  if (!ObjectId.isValid(errataId)) {
    return false;
  }

  const _id = new ObjectId(errataId);
  const result = await db.collection<ErrataDb>("erratas").deleteOne({ _id });
  if (result.deletedCount === 0) {
    return false;
  }

  await db.collection("errata-votes").deleteMany({ errataId: _id });
  return true;
}
