import type { PlayGroupMemberRole } from "@/lib/types/PlayGroup";
import type { DeckComment, DeckCommentSpace } from "@/lib/types/DeckComment";

/**
 * Les règles des commentaires de deck, sans base de données : qui lit et
 * écrit un espace, ce qu'un commentaire peut contenir, ce que chacun peut en
 * faire, et la forme sous laquelle un fil part vers l'écran.
 *
 * Le service (`lib/decks/comment-service.ts`) lit le deck, le groupe et les
 * commentaires, puis applique ce qui suit. La route d'API et les actions
 * serveur passent toutes deux par lui.
 */

export const COMMENT_MAX_LENGTH = 2000;
export const COMMENT_MAX_CARDS = 10;

export type ParsedSpace = { kind: "personal" } | { kind: "group"; playGroupId: string };

/** Un espace lu dans une adresse ou un corps de requête ; `null` s'il n'en est pas un. */
export function parseCommentSpace(value: unknown): ParsedSpace | null {
  if (value === "personal") {
    return { kind: "personal" };
  }
  if (typeof value === "string" && value.startsWith("group:")) {
    const playGroupId = value.slice("group:".length).trim();
    return playGroupId && playGroupId.length <= 100 ? { kind: "group", playGroupId } : null;
  }

  return null;
}

export function groupSpace(playGroupId: string): DeckCommentSpace {
  return `group:${playGroupId}`;
}

export function spaceKey(space: ParsedSpace): DeckCommentSpace {
  return space.kind === "personal" ? "personal" : groupSpace(space.playGroupId);
}

/**
 * Ce que le service sait du lecteur face à un espace : son rôle dans le
 * groupe, et si le deck y est bien partagé.
 */
export type SpaceContext = {
  deckOwnerId: string;
  userId: string | null;
  space: ParsedSpace;
  /** Rôle du lecteur dans le groupe de l'espace ; `null` s'il n'en est pas. */
  groupRole?: PlayGroupMemberRole | null;
  /** Le deck est-il dans la bibliothèque du groupe ? */
  deckInGroup?: boolean;
};

/**
 * Lire un espace. Personnel : l'auteur du deck seul, pour l'instant. Groupe :
 * tout membre, tant que le deck est dans le groupe — retiré, son fil se
 * referme sans être effacé, et se rouvre s'il revient.
 */
export function canReadSpace(context: SpaceContext): boolean {
  if (!context.userId) {
    return false;
  }
  if (context.space.kind === "personal") {
    return context.userId === context.deckOwnerId;
  }

  return Boolean(context.groupRole) && context.deckInGroup === true;
}

/** Écrire suit lire : l'espace n'a pas encore de lecteurs muets. */
export function canWriteSpace(context: SpaceContext): boolean {
  return canReadSpace(context);
}

function isGroupManager(role: PlayGroupMemberRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export type CommentPermissions = { canEdit: boolean; canDelete: boolean; canResolve: boolean };

/**
 * Ce que le lecteur peut faire d'un commentaire. Modifier : son auteur.
 * Supprimer : son auteur, l'auteur du deck, ou un responsable du groupe.
 * Résoudre (une racine seulement) : son auteur ou l'auteur du deck.
 */
export function commentPermissions(
  comment: Pick<DeckComment, "authorId" | "parentId" | "deletedAt">,
  context: SpaceContext,
): CommentPermissions {
  if (!context.userId || comment.deletedAt || !canReadSpace(context)) {
    return { canEdit: false, canDelete: false, canResolve: false };
  }

  const isAuthor = comment.authorId === context.userId;
  const isDeckOwner = context.deckOwnerId === context.userId;

  return {
    canEdit: isAuthor,
    canDelete: isAuthor || isDeckOwner || (context.space.kind === "group" && isGroupManager(context.groupRole)),
    canResolve: !comment.parentId && (isAuthor || isDeckOwner),
  };
}

export type CommentInputError = "EMPTY" | "TOO_LONG" | "TOO_MANY_CARDS" | "CARD_NOT_IN_DECK" | "REPLY_WITH_CARDS";

/**
 * Le texte et les cartes d'un commentaire, nettoyés. Chaque carte doit être
 * dans le deck au moment de l'écriture ; une réponse n'en lie pas, c'est sa
 * racine qui le fait.
 */
export function validateCommentInput(
  input: { body: unknown; cardIds?: unknown; isReply?: boolean },
  deckCardIds: string[],
): { ok: true; body: string; cardIds: string[] } | { ok: false; error: CommentInputError } {
  const body = typeof input.body === "string" ? input.body.replace(/\r\n/g, "\n").trim() : "";
  if (!body) {
    return { ok: false, error: "EMPTY" };
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    return { ok: false, error: "TOO_LONG" };
  }

  const raw = Array.isArray(input.cardIds) ? input.cardIds.filter((id): id is string => typeof id === "string") : [];
  const cardIds = [...new Set(raw)];
  if (input.isReply && cardIds.length > 0) {
    return { ok: false, error: "REPLY_WITH_CARDS" };
  }
  if (cardIds.length > COMMENT_MAX_CARDS) {
    return { ok: false, error: "TOO_MANY_CARDS" };
  }

  const inDeck = new Set(deckCardIds);
  if (cardIds.some((id) => !inDeck.has(id))) {
    return { ok: false, error: "CARD_NOT_IN_DECK" };
  }

  return { ok: true, body, cardIds };
}

export type CommentCardView = { id: string; name: string; removed: boolean };

/** Un commentaire tel que l'écran le reçoit : sans rien de ce qu'il n'a pas à voir. */
export type DeckCommentView = {
  id: string;
  authorId: string;
  body: string;
  cards: CommentCardView[];
  deckVersion: number;
  createdAt: string;
  editedAt?: string;
  resolvedAt?: string;
  resolvedVersion?: number;
  deleted: boolean;
  permissions: CommentPermissions;
  replies: DeckCommentView[];
};

/**
 * Le fil d'un espace : les racines, de la plus récente à la plus ancienne,
 * chacune avec ses réponses dans l'ordre. Une carte qui n'est plus dans le
 * deck est marquée `removed`, calculé à la lecture : rien n'est réécrit quand
 * le deck change. Une racine supprimée sans réponse disparaît ; avec des
 * réponses, elle reste, vidée, pour qu'elles gardent leur sens.
 */
export function buildCommentThread(
  comments: DeckComment[],
  context: SpaceContext,
  currentCardIds: string[],
): DeckCommentView[] {
  const current = new Set(currentCardIds);
  const toView = (comment: DeckComment, replies: DeckCommentView[]): DeckCommentView => ({
    id: comment.id,
    authorId: comment.authorId,
    body: comment.deletedAt ? "" : comment.body,
    cards: comment.deletedAt
      ? []
      : comment.cardIds.map((id) => ({ id, name: comment.cardNames[id] ?? id, removed: !current.has(id) })),
    deckVersion: comment.deckVersion,
    createdAt: comment.createdAt,
    ...(comment.editedAt && !comment.deletedAt ? { editedAt: comment.editedAt } : {}),
    ...(comment.resolvedAt ? { resolvedAt: comment.resolvedAt, resolvedVersion: comment.resolvedVersion } : {}),
    deleted: Boolean(comment.deletedAt),
    permissions: commentPermissions(comment, context),
    replies,
  });

  const repliesByParent = new Map<string, DeckComment[]>();
  for (const comment of comments) {
    if (comment.parentId && !comment.deletedAt) {
      repliesByParent.set(comment.parentId, [...(repliesByParent.get(comment.parentId) ?? []), comment]);
    }
  }

  return comments
    .filter((comment) => !comment.parentId)
    .filter((comment) => !comment.deletedAt || repliesByParent.has(comment.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((root) =>
      toView(
        root,
        (repliesByParent.get(root.id) ?? [])
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map((reply) => toView(reply, [])),
      ),
    );
}

/** Le nombre de commentaires visibles qui lient chaque carte, pour les pastilles de la liste. */
export function countCommentsByCard(thread: DeckCommentView[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const comment of thread) {
    for (const card of comment.cards) {
      counts[card.id] = (counts[card.id] ?? 0) + 1;
    }
  }

  return counts;
}

/** Les cartes commentées qui ne sont plus dans le deck, avec leur nombre de commentaires. */
export function removedCommentedCards(thread: DeckCommentView[]): { id: string; name: string; count: number }[] {
  const removed = new Map<string, { id: string; name: string; count: number }>();
  for (const comment of thread) {
    for (const card of comment.cards) {
      if (card.removed) {
        const entry = removed.get(card.id) ?? { id: card.id, name: card.name, count: 0 };
        entry.count += 1;
        removed.set(card.id, entry);
      }
    }
  }

  return [...removed.values()];
}

/** Les commentaires d'autrui écrits depuis le dernier passage : ceux qui méritent la pastille. */
export function isUnread(
  comment: Pick<DeckComment, "authorId" | "createdAt" | "deletedAt">,
  userId: string,
  lastReadAt: string | undefined,
): boolean {
  if (comment.deletedAt || comment.authorId === userId) {
    return false;
  }

  return !lastReadAt || comment.createdAt > lastReadAt;
}
