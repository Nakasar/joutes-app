import 'server-only';

import { Document, ObjectId, WithId } from "mongodb";
import db from "@/lib/mongodb";
import { ReportableContentType, ReportedContentPreview } from "@/lib/types/Report";
import { deleteErrataById } from "@/lib/db/erratas";
import { deletePolicyById } from "@/lib/db/policies";
import { deleteNews } from "@/lib/db/news";
import { deleteQuiz } from "@/lib/db/quizzes";
import { deleteDeckAsModerator } from "@/lib/db/decks";
import { deleteWishlistAsModerator, deleteWishlistsForPlayGroup } from "@/lib/db/wishlists";
import { deleteSellListAsModerator, deleteSellListsForPlayGroup } from "@/lib/db/sell-lists";
import { deletePlayGroup } from "@/lib/db/play-groups";
import { deletePlayGroupSessions } from "@/lib/db/play-group-sessions";
import { deleteEvent } from "@/lib/db/events";
import { deleteLair } from "@/lib/db/lairs";
import { deleteLeague } from "@/lib/db/leagues";
import { deleteTournament } from "@/lib/db/tournaments";
import { moderateUserDescription } from "@/lib/db/users";

/** Texte qui remplace la biographie d'un profil modéré. */
export const MODERATED_BIO_TEXT = "Contenu modéré";

const MAX_EXCERPT_LENGTH = 300;

function excerpt(text: unknown): string | undefined {
  if (typeof text !== "string") {
    return undefined;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.length > MAX_EXCERPT_LENGTH ? `${trimmed.slice(0, MAX_EXCERPT_LENGTH)}…` : trimmed;
}

/** Contenus identifiés par leur `_id` MongoDB. */
async function findByObjectId(collection: string, id: string): Promise<WithId<Document> | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }

  return db.collection(collection).findOne({ _id: new ObjectId(id) });
}

/** Contenus identifiés par un champ `id` textuel (évènements, groupes de jeu). */
async function findByStringId(collection: string, id: string): Promise<WithId<Document> | null> {
  return db.collection(collection).findOne({ id });
}

const MISSING_CONTENT: ReportedContentPreview = {
  exists: false,
  title: "Contenu supprimé",
};

/**
 * Lien public vers la carte concernée par un errata : il faut retrouver le jeu
 * de la carte pour construire l'URL `/games/{slug}/cards/{cardId}`.
 */
async function buildErrataUrl(cardIds: unknown): Promise<string | undefined> {
  const cardId = Array.isArray(cardIds) ? cardIds[0] : cardIds;
  if (typeof cardId !== "string" || !cardId) {
    return undefined;
  }

  const card = await db.collection("cards").findOne({ id: cardId }, { projection: { gameId: 1 } });
  if (!card?.gameId) {
    return undefined;
  }

  const game = await db.collection("games").findOne({ _id: card.gameId }, { projection: { slug: 1 } });
  const gameSlugOrId = game?.slug ?? card.gameId.toString();

  return `/games/${gameSlugOrId}/cards/${encodeURIComponent(cardId)}`;
}

function userLabel(doc: WithId<Document>): string {
  if (doc.displayName && doc.discriminator) {
    return `${doc.displayName}#${doc.discriminator}`;
  }

  return doc.displayName ?? doc.username ?? doc.name ?? "Utilisateur";
}

type ReportableContentHandler = {
  /** Aperçu affiché dans la page d'administration des signalements. */
  preview: (contentId: string) => Promise<ReportedContentPreview>;
  /**
   * Action « supprimer » de la modération. Pour les profils utilisateurs, le
   * compte est conservé et seule la biographie est remplacée.
   */
  moderate: (contentId: string) => Promise<boolean>;
};

const HANDLERS: Record<ReportableContentType, ReportableContentHandler> = {
  errata: {
    preview: async (id) => {
      const doc = await findByObjectId("erratas", id);
      if (!doc) return MISSING_CONTENT;

      const cardIds = doc.cardIds ?? doc.cardId;
      return {
        exists: true,
        title: `Errata${doc.type ? ` (${doc.type})` : ""}`,
        excerpt: excerpt(doc.details),
        url: await buildErrataUrl(cardIds),
      };
    },
    moderate: (id) => deleteErrataById(id),
  },
  policy: {
    preview: async (id) => {
      const doc = await findByObjectId("policies", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.title ?? "Politique de jeu",
        excerpt: excerpt(doc.content),
        url: `/policies/${id}`,
      };
    },
    moderate: (id) => deletePolicyById(id),
  },
  news: {
    preview: async (id) => {
      const doc = await findByObjectId("news", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.title ?? "Actualité",
        excerpt: excerpt(doc.summary ?? doc.content),
        url: `/news/${id}`,
      };
    },
    moderate: (id) => deleteNews(id),
  },
  quiz: {
    preview: async (id) => {
      const doc = await findByObjectId("quizzes", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.title ?? "Quizz",
        url: `/quizz/${id}`,
      };
    },
    moderate: (id) => deleteQuiz(id),
  },
  user: {
    preview: async (id) => {
      const doc = await findByObjectId("user", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: userLabel(doc),
        excerpt: excerpt(doc.description),
        url: `/users/${encodeURIComponent(id)}`,
      };
    },
    moderate: (id) => moderateUserDescription(id, MODERATED_BIO_TEXT),
  },
  tournament: {
    preview: async (id) => {
      const doc = await findByObjectId("tournaments", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Tournoi",
        excerpt: excerpt(doc.description),
        url: `/tournaments/${id}/player`,
      };
    },
    moderate: async (id) => {
      try {
        await deleteTournament(id);
        return true;
      } catch (error) {
        console.error("Erreur lors de la suppression du tournoi signalé:", error);
        return false;
      }
    },
  },
  league: {
    preview: async (id) => {
      const doc = await findByObjectId("leagues", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Ligue",
        excerpt: excerpt(doc.description),
        url: `/leagues/${id}`,
      };
    },
    moderate: (id) => deleteLeague(id),
  },
  event: {
    preview: async (id) => {
      const doc = await findByStringId("events", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Évènement",
        excerpt: excerpt(doc.description),
        url: `/events/${encodeURIComponent(id)}`,
      };
    },
    moderate: (id) => deleteEvent(id),
  },
  lair: {
    preview: async (id) => {
      const doc = await findByObjectId("lairs", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Lieu",
        excerpt: excerpt(doc.description),
        url: `/lairs/${id}`,
      };
    },
    moderate: (id) => deleteLair(id),
  },
  wishlist: {
    preview: async (id) => {
      const doc = await findByObjectId("wishlists", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Liste de souhaits",
        excerpt: excerpt(doc.description),
        url: `/wishlists/${id}`,
      };
    },
    moderate: (id) => deleteWishlistAsModerator(id),
  },
  "sell-list": {
    preview: async (id) => {
      const doc = await findByObjectId("sellLists", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: "Liste de vente",
        excerpt: excerpt(doc.description),
        url: `/sell-lists/${id}`,
      };
    },
    moderate: (id) => deleteSellListAsModerator(id),
  },
  "play-group": {
    preview: async (id) => {
      const doc = await findByStringId("playGroups", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Groupe de jeu",
        excerpt: excerpt(doc.description),
        url: `/play-groups/${encodeURIComponent(id)}`,
      };
    },
    moderate: async (id) => {
      // Les listes du groupe n'ont plus de propriétaire une fois celui-ci
      // supprimé : elles sont supprimées avec lui.
      const deleted = await deletePlayGroup(id);
      if (!deleted) {
        return false;
      }

      await Promise.all([
        deleteWishlistsForPlayGroup(id),
        deleteSellListsForPlayGroup(id),
        deletePlayGroupSessions(id),
      ]);
      return true;
    },
  },
  deck: {
    preview: async (id) => {
      const doc = await findByObjectId("decks", id);
      if (!doc) return MISSING_CONTENT;

      return {
        exists: true,
        title: doc.name ?? "Deck",
        excerpt: excerpt(doc.description),
        url: `/decks/${id}`,
      };
    },
    moderate: (id) => deleteDeckAsModerator(id),
  },
};

/** Aperçu d'un contenu signalé, pour la page d'administration. */
export async function getReportedContentPreview(
  contentType: ReportableContentType,
  contentId: string
): Promise<ReportedContentPreview> {
  const handler = HANDLERS[contentType];
  if (!handler) {
    return MISSING_CONTENT;
  }

  try {
    return await handler.preview(contentId);
  } catch (error) {
    console.error(`Erreur lors de la lecture du contenu signalé (${contentType}):`, error);
    return MISSING_CONTENT;
  }
}

/**
 * Applique l'action de modération « supprimer » : suppression du contenu, ou
 * remplacement de la biographie pour un profil utilisateur.
 */
export async function moderateReportedContent(
  contentType: ReportableContentType,
  contentId: string
): Promise<boolean> {
  const handler = HANDLERS[contentType];
  if (!handler) {
    return false;
  }

  return handler.moderate(contentId);
}
