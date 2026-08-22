import db from "@/lib/mongodb";
import { Deck, DeckVisibility } from "@/lib/types/Deck";
import { ObjectId, WithId, Document } from "mongodb";
import { getUsersByIds } from "@/lib/db/users";
import { deriveDeckDomains, getDeckCardInfos } from "@/lib/db/deck-cards";
import type { DeckCards } from "@/lib/decks/contents";

const COLLECTION_NAME = "decks";

// Type pour les options de recherche des decks
export type SearchDecksOptions = {
  playerId?: string;
  gameId?: string;
  /** Une valeur, ou plusieurs — « en cours » couvre le privé et le non répertorié. */
  visibility?: DeckVisibility | DeckVisibility[];
  search?: string;
  sortBy?: "name" | "createdAt" | "updatedAt" | "favoritesCount" | "views";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  /**
   * `mine` : mes decks. `all` : les miens plus ceux publiés. `public` : la
   * librairie, rien que des decks publics — même les miens n'y entrent que
   * publiés.
   */
  scope?: "mine" | "all" | "public";
  viewerId?: string;
  favoritesOnly?: boolean;
  /** Format de jeu visé (« Standard OGN »). */
  format?: string;
  /** Identifiant de la carte-légende, pour la combobox de la librairie. */
  legendCardId?: string;
  /** Domaines que le deck doit tous couvrir. */
  domains?: string[];
};

// Type pour le résultat de recherche paginé
export type PaginatedDecksResult = {
  decks: Deck[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

// Type pour un deck dans MongoDB (avec _id)
export type DeckDocument = Omit<Deck, "id"> & { _id: ObjectId };

function getUserDisplayName(user: { displayName?: string; username?: string; discriminator?: string } | null | undefined): string | undefined {
  if (!user) {
    return undefined;
  }

  if (user.displayName) {
    return user.discriminator ? `${user.displayName}#${user.discriminator}` : user.displayName;
  }

  return user.username || undefined;
}

// Convertir un document MongoDB en Deck
function toDeck(doc: WithId<Document>, creatorName?: string): Deck {
  const favoritedBy: string[] = doc.favoritedBy || [];

  return {
    id: doc._id.toString(),
    playerId: doc.playerId,
    gameId: doc.gameId,
    name: doc.name,
    url: doc.url,
    description: doc.description,
    decklist: doc.decklist,
    cards: doc.cards,
    guide: doc.guide,
    matchups: doc.matchups,
    notes: doc.notes,
    format: doc.format,
    legendCardId: doc.legendCardId,
    legendName: doc.legendName,
    domains: doc.domains,
    visibility: doc.visibility || "private",
    creatorName,
    favoritedBy,
    // Le compteur est dénormalisé pour trier la librairie ; les decks d'avant
    // son introduction ne le portent pas, la longueur du tableau le remplace.
    favoritesCount: doc.favoritesCount ?? favoritedBy.length,
    views: doc.views ?? 0,
    version: doc.version ?? 1,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

// Convertir un Deck en document MongoDB (sans id)
function toDocument(deck: Omit<Deck, "id" | "createdAt" | "updatedAt">): Omit<DeckDocument, "_id" | "createdAt" | "updatedAt"> {
  return {
    playerId: deck.playerId,
    gameId: deck.gameId,
    name: deck.name,
    url: deck.url,
    description: deck.description,
    decklist: deck.decklist,
    cards: deck.cards,
    guide: deck.guide,
    matchups: deck.matchups,
    notes: deck.notes,
    format: deck.format,
    legendCardId: deck.legendCardId,
    legendName: deck.legendName,
    domains: deck.domains,
    visibility: deck.visibility || "private",
    favoritedBy: deck.favoritedBy || [],
    favoritesCount: deck.favoritedBy?.length ?? 0,
    views: 0,
    version: 1,
  };
}

/** Une recherche saisie par un visiteur ne doit pas pouvoir devenir une expression régulière. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Rechercher des decks avec pagination et filtres
export async function searchDecks(options: SearchDecksOptions): Promise<PaginatedDecksResult> {
  const {
    playerId,
    gameId,
    visibility,
    search,
    sortBy = "updatedAt",
    sortOrder = "desc",
    page = 1,
    limit = 20,
    scope,
    viewerId,
    favoritesOnly = false,
    format,
    legendCardId,
    domains,
  } = options;

  // `$and` plutôt que d'écraser `query.$or` : la portée et la recherche
  // textuelle posent chacune une alternative, et les empiler dans la même clé
  // faisait disparaître la première — un deck privé d'un autre joueur pouvait
  // alors ressortir sur une recherche par nom.
  const conditions: Record<string, unknown>[] = [];
  const query: Record<string, unknown> = {};

  if (scope === "public") {
    // La librairie ne montre que le publié. Un deck accessible par lien
    // (`unlisted`) n'y entre pas, pas même pour son auteur : c'est tout
    // l'intérêt de cet état.
    query.visibility = "public";
  } else if (scope === "mine" && viewerId) {
    query.playerId = viewerId;
  } else if (scope === "all" && viewerId) {
    conditions.push({ $or: [{ playerId: viewerId }, { visibility: "public" }] });
  } else if (playerId) {
    query.playerId = playerId;
  }

  if (gameId) {
    query.gameId = gameId;
  }

  if (visibility && scope !== "public") {
    query.visibility = Array.isArray(visibility) ? { $in: visibility } : visibility;
  }

  if (format) {
    query.format = format;
  }

  if (legendCardId) {
    query.legendCardId = legendCardId;
  }

  if (domains && domains.length > 0) {
    query.domains = { $all: domains };
  }

  if (favoritesOnly && viewerId) {
    query.favoritedBy = viewerId;
  }

  if (search) {
    const pattern = escapeRegExp(search);
    conditions.push({
      $or: [
        { name: { $regex: pattern, $options: "i" } },
        { description: { $regex: pattern, $options: "i" } },
        { legendName: { $regex: pattern, $options: "i" } },
      ],
    });
  }

  if (conditions.length > 0) {
    query.$and = conditions;
  }

  const skip = (page - 1) * limit;

  const sortOptions: Record<string, 1 | -1> = {};
  sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;
  // Deux decks à égalité de favoris sortiraient dans un ordre arbitraire, et
  // donc différent d'une page à l'autre : le plus récent tranche.
  if (sortBy === "favoritesCount" || sortBy === "views") {
    sortOptions.updatedAt = -1;
  }

  const [decks, total] = await Promise.all([
    db.collection(COLLECTION_NAME)
      .find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .toArray(),
    db.collection(COLLECTION_NAME).countDocuments(query),
  ]);

  const creators = await getUsersByIds(decks.map((deck) => deck.playerId).filter(Boolean));
  const creatorNamesById = new Map(creators.map((user) => [user.id, getUserDisplayName(user)]));

  return {
    decks: decks.map((deck) => toDeck(deck, creatorNamesById.get(deck.playerId))),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// Récupérer un deck par son ID
export async function getDeckById(deckId: string): Promise<Deck | null> {
  if (!ObjectId.isValid(deckId)) {
    return null;
  }

  const deck = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(deckId) });
  if (!deck) {
    return null;
  }

  const creator = await getUsersByIds([deck.playerId]);
  return toDeck(deck, getUserDisplayName(creator[0]));
}

// Créer un nouveau deck
export async function createDeck(deckData: Omit<Deck, "id" | "createdAt" | "updatedAt">): Promise<Deck> {
  // Vérifier l'unicité du nom pour ce joueur
  const existingDeck = await db.collection(COLLECTION_NAME).findOne({
    playerId: deckData.playerId,
    name: deckData.name,
  });

  if (existingDeck) {
    throw new Error("Un deck avec ce nom existe déjà pour ce joueur");
  }

  const now = new Date();
  const document = {
    ...toDocument(deckData),
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(COLLECTION_NAME).insertOne(document);

  return {
    id: result.insertedId.toString(),
    ...deckData,
    createdAt: now,
    updatedAt: now,
  };
}

// Mettre à jour un deck
export async function updateDeck(
  deckId: string,
  playerId: string,
  updates: Partial<Omit<Deck, "id" | "playerId" | "createdAt" | "updatedAt">>
): Promise<Deck | null> {
  if (!ObjectId.isValid(deckId)) {
    return null;
  }

  // Si le nom est mis à jour, vérifier l'unicité
  if (updates.name) {
    const existingDeck = await db.collection(COLLECTION_NAME).findOne({
      playerId,
      name: updates.name,
      _id: { $ne: new ObjectId(deckId) },
    });

    if (existingDeck) {
      throw new Error("Un deck avec ce nom existe déjà pour ce joueur");
    }
  }

  const existing = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(deckId), playerId });
  if (!existing) {
    return null;
  }

  const set: Record<string, unknown> = { ...updates, updatedAt: new Date() };
  const inc: Record<string, number> = {};

  // Le contenu change : tout ce qui s'en déduit se recalcule ici, une fois,
  // plutôt qu'à chaque lecture. Les domaines servent au filtre de la librairie,
  // le nom de la légende à sa combobox et aux listes.
  if (updates.cards) {
    const gameId: string = existing.gameId;
    set.domains = await deriveDeckDomains(gameId, updates.cards);
    inc.version = 1;

    const legendCardId = updates.legendCardId ?? deriveLegendCardId(updates.cards);
    if (legendCardId) {
      const [legend] = await getDeckCardInfos(gameId, [legendCardId]);
      set.legendCardId = legendCardId;
      set.legendName = legend?.name;
    } else {
      set.legendCardId = undefined;
      set.legendName = undefined;
    }
  }

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(deckId), playerId },
    Object.keys(inc).length > 0 ? { $set: set, $inc: inc } : { $set: set },
    { returnDocument: "after" }
  );

  return result ? toDeck(result) : null;
}

/**
 * La carte qui donne son identité au deck : celle de la zone « légende »,
 * quand le jeu en a une. Les autres jeux n'en ont pas — le champ reste vide
 * plutôt que de désigner arbitrairement une carte du deck principal.
 */
function deriveLegendCardId(cards: DeckCards): string | undefined {
  return cards.legend?.[0]?.cardId;
}

/**
 * Compte une consultation de la fiche.
 *
 * Sans contrôle du propriétaire : la page qui appelle sait déjà qui regarde, et
 * n'incrémente pas pour l'auteur — un deck ne gagne pas des vues parce que
 * celui qui l'a écrit le relit.
 */
export async function incrementDeckViews(deckId: string): Promise<void> {
  if (!ObjectId.isValid(deckId)) {
    return;
  }

  await db.collection(COLLECTION_NAME).updateOne({ _id: new ObjectId(deckId) }, { $inc: { views: 1 } });
}

/**
 * Recopie un deck publié dans la bibliothèque de celui qui le lit.
 *
 * La copie part privée et n'emporte ni favoris, ni vues, ni notes de l'auteur :
 * c'est un nouveau deck, pas un partage. Le nom se voit suffixé tant qu'un deck
 * du même nom existe déjà — la contrainte d'unicité par joueur ferait échouer
 * l'opération, et une erreur pour un nom pris n'apprendrait rien à personne.
 */
export async function copyDeckForPlayer(source: Deck, playerId: string): Promise<Deck> {
  const name = await findAvailableDeckName(playerId, source.name);

  return createDeck({
    playerId,
    gameId: source.gameId,
    name,
    description: source.description,
    decklist: source.decklist,
    cards: source.cards,
    guide: source.guide,
    matchups: source.matchups,
    format: source.format,
    legendCardId: source.legendCardId,
    legendName: source.legendName,
    domains: source.domains,
    visibility: "private",
  });
}

async function findAvailableDeckName(playerId: string, name: string): Promise<string> {
  const base = name.slice(0, 90);

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base} (${suffix + 1})`;
    const taken = await db.collection(COLLECTION_NAME).findOne({ playerId, name: candidate });
    if (!taken) {
      return candidate;
    }
  }

  // Cinquante copies du même deck : le nom cesse d'être lisible, l'horodatage
  // au moins ne collisionne pas.
  return `${base} (${Date.now()})`;
}

export type DeckLegendFacet = {
  cardId: string;
  name: string;
  count: number;
};

/**
 * Légendes présentes dans la librairie d'un jeu, avec le nombre de decks
 * publiés qui les jouent — c'est ce que liste la combobox « Légende ».
 */
export async function getDeckLegendFacets(gameId?: string): Promise<DeckLegendFacet[]> {
  // `$type: "string"` plutôt que « différent de null » : un deck à moitié écrit
  // — un `legendName` sans `legendCardId`, ou un identifiant d'un autre type —
  // produirait un groupe dont la clé n'est pas un identifiant de carte, et donc
  // une entrée de combobox qui ne filtre rien.
  const match: Record<string, unknown> = {
    visibility: "public",
    legendCardId: { $type: "string", $ne: "" },
  };
  if (gameId) {
    match.gameId = gameId;
  }

  const rows = await db
    .collection(COLLECTION_NAME)
    .aggregate<{ _id: string; name?: string; count: number }>([
      { $match: match },
      { $group: { _id: "$legendCardId", name: { $first: "$legendName" }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 200 },
    ])
    .toArray();

  return rows
    .filter((row) => Boolean(row.name))
    .map((row) => ({ cardId: row._id, name: row.name as string, count: row.count }));
}

/**
 * Les decks mis en avant : les plus ajoutés en favori sur la semaine écoulée.
 *
 * « Du moment » se lit sur la fraîcheur autant que sur la popularité — un deck
 * publié il y a deux ans qui domine le classement des favoris n'est pas
 * l'actualité de la librairie.
 */
export async function getFeaturedDecks(gameId?: string, limit = 3): Promise<Deck[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const query: Record<string, unknown> = { visibility: "public", updatedAt: { $gte: since } };
  if (gameId) {
    query.gameId = gameId;
  }

  let docs = await db
    .collection(COLLECTION_NAME)
    .find(query)
    .sort({ favoritesCount: -1, views: -1, updatedAt: -1 })
    .limit(limit)
    .toArray();

  // Une semaine creuse ne doit pas laisser la rangée vide : on élargit alors à
  // toute la librairie plutôt que de la masquer.
  if (docs.length < limit) {
    const { updatedAt: _updatedAt, ...withoutWindow } = query;
    docs = await db
      .collection(COLLECTION_NAME)
      .find(withoutWindow)
      .sort({ favoritesCount: -1, views: -1, updatedAt: -1 })
      .limit(limit)
      .toArray();
  }

  const creators = await getUsersByIds(docs.map((doc) => doc.playerId).filter(Boolean));
  const namesById = new Map(creators.map((user) => [user.id, getUserDisplayName(user)]));

  return docs.map((doc) => toDeck(doc, namesById.get(doc.playerId)));
}

export async function toggleDeckFavorite(deckId: string, userId: string, favorite: boolean): Promise<Deck | null> {
  if (!ObjectId.isValid(deckId)) {
    return null;
  }

  const update = favorite
    ? { $addToSet: { favoritedBy: userId } }
    : { $pull: { favoritedBy: userId } };

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(deckId) },
    update as Record<string, unknown>,
    { returnDocument: "after" }
  );

  if (!result) {
    return null;
  }

  // Le compteur est recalculé depuis le tableau plutôt qu'incrémenté : un
  // double clic sur l'étoile, ou un deck d'avant le compteur, le laisserait
  // sinon durablement faux. `$addToSet` est idempotent, ce recompte l'est aussi.
  const favoritesCount = (result.favoritedBy || []).length;
  if (result.favoritesCount !== favoritesCount) {
    await db.collection(COLLECTION_NAME).updateOne({ _id: result._id }, { $set: { favoritesCount } });
    result.favoritesCount = favoritesCount;
  }

  return toDeck(result);
}

// Supprimer un deck
export async function deleteDeck(deckId: string, playerId: string): Promise<boolean> {
  if (!ObjectId.isValid(deckId)) {
    return false;
  }

  const result = await db.collection(COLLECTION_NAME).deleteOne({
    _id: new ObjectId(deckId),
    playerId,
  });

  return result.deletedCount === 1;
}

/** Best-effort "{quantity} {name}" line parser for a deck's free-text decklist. */
function parseDecklistText(decklist: string): { name: string; quantity: number }[] {
  const result: { name: string; quantity: number }[] = [];

  for (const raw of decklist.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^[A-Za-zÀ-ÿ '\-]+:$/.test(line)) {
      // Skip blank lines and section headers (e.g. "Sideboard:").
      continue;
    }

    const qtyMatch = line.match(/^\s*[xX\-*]*?(\d+)\s*x?\s+(.+)$/i);
    const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
    const name = (qtyMatch ? qtyMatch[2] : line.replace(/^[-•]\s*/, "")).trim();
    if (!name) continue;

    const existing = result.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.quantity += quantity;
    } else {
      result.push({ name, quantity });
    }
  }

  return result;
}

export type DeckCardPreview = { name: string; image: string; quantity: number };

/**
 * Resolves a deck's free-text decklist against the game's card catalog to get
 * real card images for previews — best-effort, exact-name (case-insensitive)
 * matches only, since decklists aren't structured/validated data.
 */
export async function getDeckCardPreviews(
  deck: Pick<Deck, "gameId" | "decklist">,
  maxItems = 30
): Promise<DeckCardPreview[]> {
  if (!deck.decklist || !ObjectId.isValid(deck.gameId)) {
    return [];
  }

  const parsed = parseDecklistText(deck.decklist);
  const uniqueNames = [...new Set(parsed.map((c) => c.name))];
  if (uniqueNames.length === 0) {
    return [];
  }

  const cards = await db
    .collection<{ name: string; image?: string }>("cards")
    .find(
      { gameId: new ObjectId(deck.gameId), name: { $in: uniqueNames } },
      { projection: { name: 1, image: 1 } }
    )
    .collation({ locale: "en", strength: 2 })
    .toArray();

  const cardByName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));

  const previews: DeckCardPreview[] = [];
  for (const card of parsed) {
    const match = cardByName.get(card.name.toLowerCase());
    if (match?.image) {
      previews.push({ name: card.name, image: match.image?.split('?')[0], quantity: card.quantity });
    }
    if (previews.length >= maxItems) break;
  }

  return previews;
}

// Créer les index nécessaires
export async function createDeckIndexes() {
  await db.collection(COLLECTION_NAME).createIndex({ playerId: 1, name: 1 }, { unique: true });
  await db.collection(COLLECTION_NAME).createIndex({ gameId: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ favoritedBy: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ updatedAt: -1 });
  await db.collection(COLLECTION_NAME).createIndex({ createdAt: -1 });
  // La librairie : des decks publics d'un jeu, triés par popularité, filtrés
  // par format, par légende ou par domaine.
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1, gameId: 1, favoritesCount: -1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1, gameId: 1, updatedAt: -1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1, legendCardId: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1, format: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1, domains: 1 });
}

/** Suppression d'un deck sans contrôle du propriétaire (modération). */
export async function deleteDeckAsModerator(deckId: string): Promise<boolean> {
  if (!ObjectId.isValid(deckId)) {
    return false;
  }

  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(deckId) });
  return result.deletedCount === 1;
}
