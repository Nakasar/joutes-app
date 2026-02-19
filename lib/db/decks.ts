import db from "@/lib/mongodb";
import { Deck } from "@/lib/types/Deck";
import { ObjectId, WithId, Document } from "mongodb";

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

// Convertir un document MongoDB en Deck
function toDeck(doc: WithId<Document>): Deck {
  return {
    id: doc._id.toString(),
    playerId: doc.playerId,
    gameId: doc.gameId,
    name: doc.name,
    url: doc.url,
    description: doc.description,
    visibility: doc.visibility || "private",
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
    visibility: deck.visibility || "private",
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
  } = options;

  const query: Record<string, unknown> = {};

  if (playerId) {
    query.playerId = playerId;
  }

  if (gameId) {
    query.gameId = gameId;
  }

  if (visibility) {
    query.visibility = visibility;
  }

  if (search) {
    query.$or = [
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

  return {
    decks: decks.map(toDeck),
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
  return deck ? toDeck(deck) : null;
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

// Créer les index nécessaires
export async function createDeckIndexes() {
  await db.collection(COLLECTION_NAME).createIndex({ playerId: 1, name: 1 }, { unique: true });
  await db.collection(COLLECTION_NAME).createIndex({ gameId: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ visibility: 1 });
  await db.collection(COLLECTION_NAME).createIndex({ updatedAt: -1 });
  await db.collection(COLLECTION_NAME).createIndex({ createdAt: -1 });
}
