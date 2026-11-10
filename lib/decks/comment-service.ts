import "server-only";

import { getDeckById } from "@/lib/db/decks";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import {
  getDeckComment,
  getDeckCommentRead,
  insertDeckComment,
  listDeckComments,
  markDeckCommentsRead,
  setDeckCommentResolved,
  softDeleteDeckComment,
  updateDeckCommentBody,
} from "@/lib/db/deck-comments";
import { getPlayGroupDeck } from "@/lib/db/play-group-decks";
import { getPlayGroupById } from "@/lib/db/play-groups";
import { getUsersByIds } from "@/lib/db/users";
import { deckCardIds } from "@/lib/decks/contents";
import { readMemberRole } from "@/lib/play-groups/access";
import { notifyUser } from "@/lib/services/notifications";
import type { Deck } from "@/lib/types/Deck";
import type { DeckComment, DeckCommentSpace } from "@/lib/types/DeckComment";
import type { PlayGroup } from "@/lib/types/PlayGroup";

import {
  buildCommentThread,
  canReadSpace,
  canWriteSpace,
  commentPermissions,
  parseCommentSpace,
  spaceKey,
  validateCommentInput,
  type CommentInputError,
  type DeckCommentView,
  type ParsedSpace,
  type SpaceContext,
} from "./comments";

/**
 * Les commentaires de deck côté serveur : lire le deck, le groupe et le fil,
 * appliquer les règles de `./comments.ts`, écrire. La route d'API
 * `/api/decks/[deckId]/comments` et les actions serveur des écrans passent
 * toutes deux par ici, pour ne tenir les règles qu'à un endroit.
 */

export type CommentServiceError = "UNAUTHENTICATED" | "INVALID" | "NOT_FOUND" | "FORBIDDEN" | CommentInputError;

type Failure = { ok: false; error: CommentServiceError };

type OpenedSpace = {
  deck: Deck;
  space: ParsedSpace;
  key: DeckCommentSpace;
  context: SpaceContext;
  group: PlayGroup | null;
};

async function openSpace(deckId: string, spaceValue: unknown, userId: string | null): Promise<OpenedSpace | Failure> {
  if (!userId) {
    return { ok: false, error: "UNAUTHENTICATED" };
  }

  const space = parseCommentSpace(spaceValue);
  if (!space) {
    return { ok: false, error: "INVALID" };
  }

  const deck = await getDeckById(deckId);
  if (!deck) {
    return { ok: false, error: "NOT_FOUND" };
  }

  let group: PlayGroup | null = null;
  const context: SpaceContext = { deckOwnerId: deck.playerId, userId, space };

  if (space.kind === "group") {
    const [found, link] = await Promise.all([
      getPlayGroupById(space.playGroupId),
      getPlayGroupDeck(space.playGroupId, deckId),
    ]);
    group = found;
    context.groupRole = found ? readMemberRole(found, userId) : null;
    context.deckInGroup = Boolean(link);
  }

  if (!canReadSpace(context)) {
    return { ok: false, error: "FORBIDDEN" };
  }

  return { deck, space, key: spaceKey(space), context, group };
}

/**
 * Le deck d'un fil où l'on peut écrire, sans lire le fil : la porte des outils
 * qui doivent vérifier l'accès avant de dire quoi que ce soit du deck (ses
 * cartes, par exemple).
 */
export async function openWritableSpace(
  deckId: string,
  spaceValue: unknown,
  userId: string | null,
): Promise<{ ok: true; deck: Deck } | Failure> {
  const opened = await openSpace(deckId, spaceValue, userId);
  if ("error" in opened) return opened;
  if (!canWriteSpace(opened.context)) {
    return { ok: false, error: "FORBIDDEN" };
  }
  return { ok: true, deck: opened.deck };
}

export type CommentAuthor = { name: string; avatar?: string };

export type CommentThreadPayload = {
  deckId: string;
  /** Le nom du deck, pour l'assistant et les écrans qui n'ont pas le deck sous la main. */
  deckName: string;
  space: DeckCommentSpace;
  deckVersion: number;
  comments: DeckCommentView[];
  authors: Record<string, CommentAuthor>;
  /** Le passage précédent du lecteur, pour marquer ce qui est neuf avant de le noter lu. */
  lastReadAt?: string;
};

async function readAuthors(ids: string[]): Promise<Record<string, CommentAuthor>> {
  const users = await getUsersByIds([...new Set(ids)]);

  return Object.fromEntries(
    users.map((user) => [user.id, { name: user.displayName || user.username || "Joueur", avatar: user.avatar || undefined }]),
  );
}

/**
 * Le fil d'un espace, prêt pour l'écran. `markRead` note le passage du lecteur
 * ensuite ; le moment précédent est rendu pour que l'écran souligne ce qui
 * était neuf.
 */
export async function readCommentThread(
  deckId: string,
  spaceValue: unknown,
  userId: string | null,
  options: { markRead?: boolean } = {},
): Promise<{ ok: true; thread: CommentThreadPayload } | Failure> {
  const opened = await openSpace(deckId, spaceValue, userId);
  if ("error" in opened) return opened;

  const [comments, lastReadAt] = await Promise.all([
    listDeckComments(deckId, opened.key),
    getDeckCommentRead(userId!, deckId, opened.key),
  ]);
  const thread = buildCommentThread(comments, opened.context, deckCardIds(opened.deck.cards));
  const authors = await readAuthors(comments.map((comment) => comment.authorId));

  if (options.markRead) {
    await markDeckCommentsRead(userId!, deckId, opened.key);
  }

  return {
    ok: true,
    thread: {
      deckId,
      deckName: opened.deck.name,
      space: opened.key,
      deckVersion: opened.deck.version ?? 1,
      comments: thread,
      authors,
      ...(lastReadAt ? { lastReadAt } : {}),
    },
  };
}

export async function markCommentThreadRead(deckId: string, spaceValue: unknown, userId: string | null) {
  const opened = await openSpace(deckId, spaceValue, userId);
  if ("error" in opened) return opened;

  await markDeckCommentsRead(userId!, deckId, opened.key);
  return { ok: true as const };
}

async function cardNamesFor(deck: Deck, cardIds: string[]): Promise<Record<string, string>> {
  if (cardIds.length === 0) return {};
  const infos = await getDeckCardInfos(deck.gameId, cardIds);

  return Object.fromEntries(cardIds.map((id) => [id, infos.find((info) => info.id === id)?.name ?? id]));
}

function excerpt(body: string): string {
  const line = body.replace(/\s+/g, " ").trim();
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

/**
 * L'auteur du deck apprend chaque nouveau commentaire, réponses comprises,
 * sauf les siens. Une notification manquée ne doit pas faire échouer
 * l'écriture : elle est journalisée, pas levée.
 */
async function notifyDeckOwner(opened: OpenedSpace, comment: DeckComment) {
  if (comment.authorId === opened.deck.playerId || opened.space.kind !== "group" || !opened.group) {
    return;
  }

  try {
    const authors = await readAuthors([comment.authorId]);
    const author = authors[comment.authorId]?.name ?? "Un membre";
    await notifyUser(
      opened.deck.playerId,
      comment.parentId ? `Nouvelle réponse sur ${opened.deck.name}` : `Nouveau commentaire sur ${opened.deck.name}`,
      `${author} dans ${opened.group.name} : « ${excerpt(comment.body)} »`,
      { link: `/play-groups/${opened.group.id}?view=decks&deck=${opened.deck.id}` },
    );
  } catch (error) {
    console.error("Error notifying deck owner of a comment:", error);
  }
}

export async function postComment(
  deckId: string,
  spaceValue: unknown,
  userId: string | null,
  input: { body: unknown; cardIds?: unknown; parentId?: unknown },
): Promise<{ ok: true; comment: DeckComment } | Failure> {
  const opened = await openSpace(deckId, spaceValue, userId);
  if ("error" in opened) return opened;
  if (!canWriteSpace(opened.context)) {
    return { ok: false, error: "FORBIDDEN" };
  }

  let parentId: string | undefined;
  if (input.parentId !== undefined && input.parentId !== null) {
    const parent = typeof input.parentId === "string" ? await getDeckComment(input.parentId) : null;
    // On répond à une racine vivante du même fil, et à rien d'autre : un seul niveau.
    if (!parent || parent.deckId !== deckId || parent.space !== opened.key || parent.parentId || parent.deletedAt) {
      return { ok: false, error: "NOT_FOUND" };
    }
    parentId = parent.id;
  }

  const valid = validateCommentInput({ ...input, isReply: Boolean(parentId) }, deckCardIds(opened.deck.cards));
  if (!valid.ok) return valid;

  const comment = await insertDeckComment({
    deckId,
    space: opened.key,
    authorId: userId!,
    body: valid.body,
    cardIds: valid.cardIds,
    cardNames: await cardNamesFor(opened.deck, valid.cardIds),
    deckVersion: opened.deck.version ?? 1,
    ...(parentId ? { parentId } : {}),
  });

  // Écrire dans un fil, c'est l'avoir lu jusque-là.
  await markDeckCommentsRead(userId!, deckId, opened.key);
  await notifyDeckOwner(opened, comment);

  return { ok: true, comment };
}

/** Un commentaire vivant du deck nommé par l'adresse, et ce que le lecteur peut en faire. */
async function openComment(deckId: string, commentId: string, userId: string | null) {
  const comment = await getDeckComment(commentId);
  if (!comment || comment.deletedAt || comment.deckId !== deckId) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  const opened = await openSpace(comment.deckId, comment.space, userId);
  if ("error" in opened) return opened;

  return { comment, opened, permissions: commentPermissions(comment, opened.context) };
}

export async function editComment(
  deckId: string,
  commentId: string,
  userId: string | null,
  input: { body: unknown; cardIds?: unknown },
): Promise<{ ok: true } | Failure> {
  const found = await openComment(deckId, commentId, userId);
  if ("error" in found) return found;
  if (!found.permissions.canEdit) {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Une carte déjà liée et retirée du deck depuis reste admise : la modifier ne
  // doit pas obliger à la délier.
  const allowed = [...new Set([...deckCardIds(found.opened.deck.cards), ...found.comment.cardIds])];
  const valid = validateCommentInput({ ...input, isReply: Boolean(found.comment.parentId) }, allowed);
  if (!valid.ok) return valid;

  const fresh = valid.cardIds.filter((id) => !found.comment.cardNames[id]);
  const cardNames = {
    ...Object.fromEntries(valid.cardIds.filter((id) => found.comment.cardNames[id]).map((id) => [id, found.comment.cardNames[id]])),
    ...(await cardNamesFor(found.opened.deck, fresh)),
  };

  await updateDeckCommentBody(commentId, { body: valid.body, cardIds: valid.cardIds, cardNames });
  return { ok: true };
}

export async function resolveComment(
  deckId: string,
  commentId: string,
  userId: string | null,
  resolved: boolean,
): Promise<{ ok: true } | Failure> {
  const found = await openComment(deckId, commentId, userId);
  if ("error" in found) return found;
  if (!found.permissions.canResolve) {
    return { ok: false, error: "FORBIDDEN" };
  }

  await setDeckCommentResolved(
    commentId,
    resolved ? { by: userId!, version: found.opened.deck.version ?? 1 } : null,
  );
  return { ok: true };
}

export async function deleteComment(
  deckId: string,
  commentId: string,
  userId: string | null,
): Promise<{ ok: true } | Failure> {
  const found = await openComment(deckId, commentId, userId);
  if ("error" in found) return found;
  if (!found.permissions.canDelete) {
    return { ok: false, error: "FORBIDDEN" };
  }

  await softDeleteDeckComment(commentId);
  return { ok: true };
}

/** Le statut HTTP d'un échec, pour la route d'API. */
export function commentErrorStatus(error: CommentServiceError): number {
  switch (error) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}
