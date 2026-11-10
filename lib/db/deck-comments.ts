import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import type { DeckComment, DeckCommentRead, DeckCommentSpace } from "@/lib/types/DeckComment";

/**
 * Les commentaires de deck et les passages des lecteurs. Les règles sont dans
 * `lib/decks/comments.ts` ; ce module ne fait qu'écrire et lire.
 *
 * Index : `lib/db/indexes/users.ts`, section groupes de jeu.
 */
export const DECK_COMMENTS_COLLECTION = "deckComments";
export const DECK_COMMENT_READS_COLLECTION = "deckCommentReads";

const comments = db.collection<DeckComment>(DECK_COMMENTS_COLLECTION);
const reads = db.collection<DeckCommentRead>(DECK_COMMENT_READS_COLLECTION);

function toComment(doc: DeckComment): DeckComment {
  const { id, deckId, space, authorId, body, cardIds, cardNames, deckVersion, createdAt } = doc;

  return {
    id,
    deckId,
    space,
    authorId,
    body,
    cardIds: cardIds ?? [],
    cardNames: cardNames ?? {},
    deckVersion,
    createdAt,
    ...(doc.parentId ? { parentId: doc.parentId } : {}),
    ...(doc.resolvedAt
      ? { resolvedAt: doc.resolvedAt, resolvedBy: doc.resolvedBy, resolvedVersion: doc.resolvedVersion }
      : {}),
    ...(doc.editedAt ? { editedAt: doc.editedAt } : {}),
    ...(doc.deletedAt ? { deletedAt: doc.deletedAt } : {}),
  };
}

/** Le fil d'un espace, supprimés compris : c'est le fil qui décide de ce qu'il en montre. */
export async function listDeckComments(deckId: string, space: DeckCommentSpace): Promise<DeckComment[]> {
  const docs = await comments.find({ deckId, space }).sort({ createdAt: 1 }).limit(2000).toArray();

  return docs.map(toComment);
}

export async function getDeckComment(commentId: string): Promise<DeckComment | null> {
  const doc = await comments.findOne({ id: commentId });

  return doc ? toComment(doc) : null;
}

export async function insertDeckComment(input: Omit<DeckComment, "id" | "createdAt">): Promise<DeckComment> {
  const comment: DeckComment = { ...input, id: new ObjectId().toString(), createdAt: new Date().toISOString() };
  await comments.insertOne({ ...comment });

  return comment;
}

export async function updateDeckCommentBody(
  commentId: string,
  update: { body: string; cardIds: string[]; cardNames: Record<string, string> },
): Promise<boolean> {
  const result = await comments.updateOne(
    { id: commentId, deletedAt: { $exists: false } },
    { $set: { ...update, editedAt: new Date().toISOString() } },
  );

  return result.matchedCount === 1;
}

export async function setDeckCommentResolved(
  commentId: string,
  resolution: { by: string; version: number } | null,
): Promise<boolean> {
  const result = await comments.updateOne(
    { id: commentId, deletedAt: { $exists: false } },
    resolution
      ? { $set: { resolvedAt: new Date().toISOString(), resolvedBy: resolution.by, resolvedVersion: resolution.version } }
      : { $unset: { resolvedAt: "", resolvedBy: "", resolvedVersion: "" } },
  );

  return result.matchedCount === 1;
}

export async function softDeleteDeckComment(commentId: string): Promise<boolean> {
  const result = await comments.updateOne(
    { id: commentId, deletedAt: { $exists: false } },
    { $set: { deletedAt: new Date().toISOString() } },
  );

  return result.matchedCount === 1;
}

/** Un deck supprimé emporte ses commentaires, dans tous les espaces. */
export async function deleteDeckCommentsForDeck(deckId: string): Promise<void> {
  await Promise.all([comments.deleteMany({ deckId }), reads.deleteMany({ deckId })]);
}

/** Note le passage d'un lecteur sur un fil. */
export async function markDeckCommentsRead(userId: string, deckId: string, space: DeckCommentSpace): Promise<void> {
  await reads.updateOne(
    { userId, deckId, space },
    { $set: { lastReadAt: new Date().toISOString() } },
    { upsert: true },
  );
}

export async function getDeckCommentRead(
  userId: string,
  deckId: string,
  space: DeckCommentSpace,
): Promise<string | undefined> {
  const doc = await reads.findOne({ userId, deckId, space });

  return doc?.lastReadAt;
}

export type DeckCommentCounts = { total: number; unread: number };

/**
 * Pour chaque deck d'un espace : le nombre de commentaires visibles, et ceux
 * d'autrui écrits depuis le dernier passage du lecteur. Un fil jamais ouvert
 * compte depuis `since` (l'arrivée du membre dans le groupe), pour ne pas
 * présenter tout l'historique comme neuf.
 */
export async function countDeckCommentsInSpace(
  space: DeckCommentSpace,
  userId: string,
  since?: string,
): Promise<Map<string, DeckCommentCounts>> {
  const [totals, userReads] = await Promise.all([
    comments
      .aggregate<{ _id: string; total: number }>([
        { $match: { space, deletedAt: { $exists: false } } },
        { $group: { _id: "$deckId", total: { $sum: 1 } } },
      ])
      .toArray(),
    reads.find({ userId, space }).toArray(),
  ]);

  const lastRead = new Map(userReads.map((read) => [read.deckId, read.lastReadAt]));
  const unreadFilter = [
    ...[...lastRead].map(([deckId, lastReadAt]) => ({ deckId, createdAt: { $gt: lastReadAt } })),
    {
      deckId: { $nin: [...lastRead.keys()] },
      ...(since ? { createdAt: { $gt: since } } : {}),
    },
  ];

  const unread = await comments
    .aggregate<{ _id: string; unread: number }>([
      { $match: { space, authorId: { $ne: userId }, deletedAt: { $exists: false }, $or: unreadFilter } },
      { $group: { _id: "$deckId", unread: { $sum: 1 } } },
    ])
    .toArray();
  const unreadByDeck = new Map(unread.map((row) => [row._id, row.unread]));

  return new Map(totals.map((row) => [row._id, { total: row.total, unread: unreadByDeck.get(row._id) ?? 0 }]));
}

/** Les derniers commentaires d'un espace, tous decks confondus : la colonne de la bibliothèque. */
export async function listLatestCommentsInSpace(space: DeckCommentSpace, limit = 3): Promise<DeckComment[]> {
  const docs = await comments
    .find({ space, deletedAt: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();

  return docs.map(toComment);
}

/** Le nombre de commentaires de chaque espace d'un deck : l'encart « 12 commentaires dans Les Corbeaux ». */
export async function countDeckCommentsBySpace(deckId: string): Promise<Map<DeckCommentSpace, number>> {
  const rows = await comments
    .aggregate<{ _id: DeckCommentSpace; total: number }>([
      { $match: { deckId, deletedAt: { $exists: false } } },
      { $group: { _id: "$space", total: { $sum: 1 } } },
    ])
    .toArray();

  return new Map(rows.map((row) => [row._id, row.total]));
}
