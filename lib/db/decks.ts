import db from "@/lib/mongodb";
import { Deck } from "@/lib/types/Deck";
import { ObjectId, WithId, Document } from "mongodb";
import { getUsersByIds } from "@/lib/db/users";

const COLLECTION_NAME = "decks";

// Type pour les options de recherche des decks
export type SearchDecksOptions = {
  playerId?: string;
  gameId?: string;
  visibility?: "private" | "public";
  search?: string;
  sortBy?: "name" | "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
  scope?: "mine" | "all";
  viewerId?: string;
  favoritesOnly?: boolean;
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
  return {
    id: doc._id.toString(),
    playerId: doc.playerId,
    gameId: doc.gameId,
    name: doc.name,
    url: doc.url,
    description: doc.description,
    decklist: doc.decklist,
    visibility: doc.visibility || "private",
    creatorName,
    favoritedBy: doc.favoritedBy || [],
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
    visibility: deck.visibility || "private",
    favoritedBy: deck.favoritedBy || [],
  };
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
  } = options;

  const query: Record<string, unknown> = {};

  if (scope === "mine" && viewerId) {
    query.playerId = viewerId;
  } else if (scope === "all" && viewerId) {
    query.$or = [
      { playerId: viewerId },
      { visibility: "public" },
    ];
  } else if (playerId) {
    query.playerId = playerId;
  }

  if (gameId) {
    query.gameId = gameId;
  }

  if (visibility) {
    query.visibility = visibility;
  }

  if (favoritesOnly && viewerId) {
    query.favoritedBy = viewerId;
  }

  if (search) {
    query.$or = [
      ...(Array.isArray(query.$or) ? query.$or : []),
      { name: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * limit;

  const sortOptions: Record<string, 1 | -1> = {};
  sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

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

  const result = await db.collection(COLLECTION_NAME).findOneAndUpdate(
    { _id: new ObjectId(deckId), playerId },
    { $set: { ...updates, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  return result ? toDeck(result) : null;
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

  return result ? toDeck(result) : null;
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
      previews.push({ name: card.name, image: match.image, quantity: card.quantity });
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
}
