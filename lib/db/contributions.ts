import "server-only";

import { ObjectId, type Document, type Filter } from "mongodb";
import db from "@/lib/mongodb";
import { AUTOMATED_EVENT_AUTHORS } from "@/lib/events/source-events";
import {
  CONTRIBUTIONS_PAGE_SIZE,
  contributionExcerpt,
  mergeContributionPages,
  type Contribution,
  type ContributionCursor,
  type ContributionKind,
} from "@/lib/contributions/feed";

/**
 * Lecture du centre des contributions (voir `lib/contributions/feed.ts` pour
 * ce qui y figure et pourquoi).
 *
 * Chaque type a sa source : une requête triée sur sa date de publication,
 * bornée par le curseur. On lit un peu plus d'une page par source, on fusionne,
 * et on garde la page. Une source par collection plutôt qu'une collection
 * agrégée : rien n'est à tenir à jour à chaque publication, et l'écran ne lit
 * que les types qu'on lui demande.
 *
 * Les index qui servent ces tris sont déclarés dans `lib/db/indexes/`.
 */

/**
 * Lignes lues en plus d'une page par source. Une source borne sa lecture par
 * la date du curseur, au plus tard : les lignes de même date déjà affichées
 * reviennent, et c'est la fusion qui les écarte. Cette marge les absorbe.
 */
const TIE_MARGIN = 10;

type SourceQuery = { before: Date | null; limit: number };
type Source = (query: SourceQuery) => Promise<Contribution[]>;

function idString(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/** Contenus datés par un champ `Date` (ou une chaîne ISO : même ordre, même borne). */
async function readByDateField(
  collection: string,
  field: string,
  filter: Filter<Document>,
  { before, limit }: SourceQuery,
  { iso = false }: { iso?: boolean } = {},
): Promise<Document[]> {
  const bound = before ? { [field]: { $lte: iso ? before.toISOString() : before } } : { [field]: { $exists: true } };

  return db
    .collection(collection)
    .find({ ...filter, ...bound })
    .sort({ [field]: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Contenus sans date de création, datés par leur `_id` : évènements et lieux.
 * Un `ObjectId` porte la seconde de sa création ; on borne donc à la seconde
 * qui suit celle du curseur, et la fusion écarte ce qui est déjà passé.
 */
async function readByObjectIdDate(
  collection: string,
  filter: Filter<Document>,
  { before, limit }: SourceQuery,
): Promise<Document[]> {
  const bound = before
    ? { _id: { $lt: ObjectId.createFromTime(Math.floor(before.getTime() / 1000) + 1) } }
    : {};

  return db
    .collection(collection)
    .find({ ...filter, ...bound })
    .sort({ _id: -1 })
    .limit(limit)
    .toArray();
}

function objectIdDate(doc: Document): Date | null {
  return doc._id instanceof ObjectId ? doc._id.getTimestamp() : null;
}

/** Retire les documents sans date lisible : ils ne peuvent pas prendre place dans le fil. */
function dated(
  docs: Document[],
  read: (doc: Document) => Date | null,
  build: (doc: Document, publishedAt: Date) => Contribution,
): Contribution[] {
  return docs.flatMap((doc) => {
    const publishedAt = read(doc);
    return publishedAt ? [build(doc, publishedAt)] : [];
  });
}

const VISIBILITY_DETAILS: Record<string, string | undefined> = {
  unlisted: "Non répertorié",
  public: undefined,
};

const ERRATA_TYPE_LABELS: Record<string, string> = {
  errata: "Errata",
  clarification: "Clarification",
  ruling: "Ruling",
};

const CONTENT_KIND_LABELS: Record<string, string> = {
  video: "Vidéo",
  article: "Article",
  replay: "Replay",
};

/** Carte concernée par un errata, résolue après coup pour la seule page affichée. */
const ERRATA_CARD_ID = Symbol("errataCardId");
type ErrataContribution = Contribution & { [ERRATA_CARD_ID]?: string };

const SOURCES: Record<ContributionKind, Source> = {
  "user-content": async (query) =>
    dated(
      await readByDateField("userContents", "publishedAt", { visibility: "public" }, query, { iso: true }),
      (doc) => asDate(doc.publishedAt),
      (doc, publishedAt) => ({
        kind: "user-content",
        id: doc._id.toString(),
        title: doc.title || "Publication",
        detail: CONTENT_KIND_LABELS[doc.kind],
        excerpt: contributionExcerpt(doc.summary ?? doc.body),
        authorId: idString(doc.authorId),
        publishedAt,
        url: `/users/${doc.authorId}?tab=publications&article=${doc._id.toString()}`,
      }),
    ),

  errata: async (query) =>
    dated(
      await readByDateField("erratas", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt): ErrataContribution => {
        const cardIds = Array.isArray(doc.cardIds) ? doc.cardIds : doc.cardId ? [doc.cardId] : [];
        const type = ERRATA_TYPE_LABELS[doc.type] ?? "Errata";
        return {
          kind: "errata",
          id: doc._id.toString(),
          title: type,
          detail: doc.deprecatedAt ? "Obsolète" : undefined,
          excerpt: contributionExcerpt(doc.details),
          authorId: idString(doc.createdBy),
          publishedAt,
          [ERRATA_CARD_ID]: typeof cardIds[0] === "string" ? cardIds[0] : undefined,
        };
      },
    ),

  policy: async (query) =>
    dated(
      await readByDateField("policies", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "policy",
        id: doc._id.toString(),
        title: doc.title || "Politique de jeu",
        detail: doc.deprecatedAt ? "Obsolète" : undefined,
        excerpt: contributionExcerpt(doc.content),
        authorId: idString(doc.createdBy),
        publishedAt,
        url: `/policies/${doc._id.toString()}`,
      }),
    ),

  news: async (query) =>
    dated(
      await readByDateField("news", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "news",
        id: doc._id.toString(),
        title: doc.title || "Actualité",
        excerpt: contributionExcerpt(doc.summary ?? doc.content),
        authorId: idString(doc.authorId),
        publishedAt,
        url: `/news/${doc._id.toString()}`,
      }),
    ),

  quiz: async (query) =>
    dated(
      await readByDateField("quizzes", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "quiz",
        id: doc._id.toString(),
        title: doc.title || "Quizz",
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.authorId),
        publishedAt,
        url: `/quizz/${doc._id.toString()}`,
      }),
    ),

  deck: async (query) =>
    dated(
      await readByDateField("decks", "createdAt", { visibility: { $in: ["public", "unlisted"] } }, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "deck",
        id: doc._id.toString(),
        title: doc.name || "Deck",
        detail: VISIBILITY_DETAILS[doc.visibility],
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.playerId),
        publishedAt,
        url: `/decks/${doc._id.toString()}`,
      }),
    ),

  wishlist: async (query) =>
    dated(
      await readByDateField("wishlists", "createdAt", { visibility: { $in: ["public", "unlisted"] } }, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "wishlist",
        id: doc._id.toString(),
        title: doc.name || "Liste de souhaits",
        detail: [doc.ownerType === "play-group" ? "Liste d'un groupe" : undefined, VISIBILITY_DETAILS[doc.visibility]]
          .filter(Boolean)
          .join(" · ") || undefined,
        excerpt: contributionExcerpt(doc.description),
        // Une liste de groupe appartient au groupe, pas à une personne.
        authorId: doc.ownerType === "user" ? idString(doc.ownerId) : undefined,
        publishedAt,
        url: `/wishlists/${doc._id.toString()}`,
      }),
    ),

  event: async (query) =>
    dated(
      // Les évènements importés par les lieux ne sont l'œuvre de personne.
      // Ceux créés par l'outil MCP portent l'identifiant de leur auteur dans
      // `addedBy`, sans `creatorId`.
      await readByObjectIdDate("events", { addedBy: { $nin: [...AUTOMATED_EVENT_AUTHORS] } }, query),
      objectIdDate,
      (doc, publishedAt) => ({
        kind: "event",
        id: String(doc.id || doc._id),
        title: doc.name || "Évènement",
        detail: doc.status === "cancelled" ? "Annulé" : undefined,
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.creatorId) ?? (ObjectId.isValid(doc.addedBy) ? idString(doc.addedBy) : undefined),
        publishedAt,
        url: doc.id ? `/events/${encodeURIComponent(doc.id)}` : undefined,
      }),
    ),

  tournament: async (query) =>
    dated(
      await readByDateField("tournaments", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "tournament",
        id: doc._id.toString(),
        title: doc.name || "Tournoi",
        detail: doc.status === "draft" ? "En préparation" : undefined,
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.createdBy),
        publishedAt,
        url: `/tournaments/${doc._id.toString()}/player`,
      }),
    ),

  league: async (query) =>
    dated(
      await readByDateField("leagues", "createdAt", {}, query),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "league",
        id: doc._id.toString(),
        title: doc.name || "Ligue",
        detail: doc.isPublic === false ? "Sur invitation" : undefined,
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.creatorId),
        publishedAt,
        url: `/leagues/${doc._id.toString()}`,
      }),
    ),

  lair: async (query) =>
    dated(
      // Sans `createdBy`, le lieu a été ajouté par l'administration ou importé.
      await readByObjectIdDate("lairs", { createdBy: { $exists: true, $nin: [null, ""] } }, query),
      objectIdDate,
      (doc, publishedAt) => ({
        kind: "lair",
        id: doc._id.toString(),
        title: doc.name || "Lieu",
        detail: doc.isPrivate ? "Privé" : undefined,
        excerpt: contributionExcerpt(doc.description ?? doc.address),
        authorId: idString(doc.createdBy),
        publishedAt,
        url: `/lairs/${doc._id.toString()}`,
      }),
    ),

  "play-group": async (query) =>
    dated(
      await readByDateField("playGroups", "createdAt", {}, query, { iso: true }),
      (doc) => asDate(doc.createdAt),
      (doc, publishedAt) => ({
        kind: "play-group",
        id: String(doc.id || doc._id),
        title: doc.name || "Groupe de jeu",
        detail: doc.visibility === "private" ? "Privé" : undefined,
        excerpt: contributionExcerpt(doc.description),
        authorId: idString(doc.ownerId),
        publishedAt,
        url: `/play-groups/${encodeURIComponent(String(doc.id || doc._id))}`,
      }),
    ),

  "play-group-content": async (query) =>
    (await readPlayGroupItems("contents", query)).map(({ group, item, publishedAt }) => ({
      kind: "play-group-content",
      id: String(item.id),
      title: item.title || "Publication",
      detail: [CONTENT_KIND_LABELS[item.kind], group.name].filter(Boolean).join(" · ") || undefined,
      excerpt: contributionExcerpt(item.summary ?? item.body),
      authorId: idString(item.authorId),
      publishedAt,
      url:
        item.kind === "article"
          ? `/play-groups/${encodeURIComponent(group.id)}?view=showcase&article=${encodeURIComponent(item.id)}`
          : `/play-groups/${encodeURIComponent(group.id)}?view=showcase`,
    })),

  "play-group-announcement": async (query) =>
    (await readPlayGroupItems("announcements", query)).map(({ group, item, publishedAt }) => ({
      kind: "play-group-announcement",
      id: String(item.id),
      title: item.title || "Annonce",
      detail: [item.scope === "group" ? "Réservée au groupe" : undefined, group.name].filter(Boolean).join(" · ") || undefined,
      excerpt: contributionExcerpt(item.body),
      authorId: idString(item.authorId),
      publishedAt,
      url: `/play-groups/${encodeURIComponent(group.id)}?view=announcements`,
    })),
};

/**
 * Publications et annonces des groupes : des sous-documents de `playGroups`,
 * qu'il faut déplier pour les trier. La collection compte un document par
 * groupe — peu de chose — et le premier `$match` écarte les groupes qui n'ont
 * rien publié avant le curseur.
 */
async function readPlayGroupItems(
  field: "contents" | "announcements",
  { before, limit }: SourceQuery,
): Promise<{ group: { id: string; name?: string }; item: Document; publishedAt: Date }[]> {
  const path = `options.${field}`;
  const bound = before ? { $lte: before.toISOString() } : { $exists: true };

  const rows = await db
    .collection("playGroups")
    .aggregate([
      { $match: { [`${path}.publishedAt`]: bound } },
      { $project: { id: 1, name: 1, item: `$${path}` } },
      { $unwind: "$item" },
      { $match: { "item.publishedAt": bound } },
      { $sort: { "item.publishedAt": -1 } },
      { $limit: limit },
    ])
    .toArray();

  return rows.flatMap((row) => {
    const publishedAt = asDate(row.item?.publishedAt);
    return publishedAt && row.item?.id
      ? [{ group: { id: String(row.id || row._id), name: row.name }, item: row.item, publishedAt }]
      : [];
  });
}

/** Titre et lien d'un errata : la carte qu'il concerne, et la fiche de celle-ci dans son jeu. */
async function resolveErrataCards(items: Contribution[]): Promise<void> {
  const erratas = items.filter((item): item is ErrataContribution => item.kind === "errata");
  const cardIds = [...new Set(erratas.map((item) => item[ERRATA_CARD_ID]).filter((id): id is string => !!id))];
  if (cardIds.length === 0) return;

  const cards = await db
    .collection("cards")
    .find({ id: { $in: cardIds } }, { projection: { id: 1, name: 1, gameId: 1 } })
    .toArray();
  const cardById = new Map(cards.map((card) => [card.id as string, card]));

  const gameIds = [...new Set(cards.map((card) => card.gameId?.toString()).filter(Boolean))]
    .filter((id) => ObjectId.isValid(id))
    .map((id) => ObjectId.createFromHexString(id));
  const games = await db
    .collection("games")
    .find({ _id: { $in: gameIds } }, { projection: { slug: 1 } })
    .toArray();
  const slugByGameId = new Map(games.map((game) => [game._id.toString(), game.slug as string | undefined]));

  for (const errata of erratas) {
    const card = errata[ERRATA_CARD_ID] ? cardById.get(errata[ERRATA_CARD_ID]) : undefined;
    if (!card) continue;

    if (card.name) errata.title = `${errata.title} — ${card.name}`;
    if (card.gameId) {
      const game = slugByGameId.get(card.gameId.toString()) ?? card.gameId.toString();
      errata.url = `/games/${game}/cards/${encodeURIComponent(card.id)}`;
    }
  }
}

/**
 * Une page du fil : les contributions publiées avant `after` (exclu), parmi
 * les types demandés, de la plus récente à la plus ancienne.
 */
export async function listContributions({
  kinds,
  after,
  limit = CONTRIBUTIONS_PAGE_SIZE,
}: {
  kinds: ContributionKind[];
  after: ContributionCursor | null;
  limit?: number;
}): Promise<{ items: Contribution[]; next: ContributionCursor | null }> {
  const query: SourceQuery = { before: after?.publishedAt ?? null, limit: limit + TIE_MARGIN };

  const pages = await Promise.all(
    kinds.map(async (kind) => {
      try {
        return await SOURCES[kind](query);
      } catch (error) {
        // Une collection illisible ne doit pas vider tout le fil.
        console.error(`Centre des contributions : lecture impossible (${kind})`, error);
        return [];
      }
    }),
  );

  const page = mergeContributionPages(pages, { after, limit });
  await resolveErrataCards(page.items);
  return page;
}
