import db from "@/lib/mongodb";
import { Game } from "@/lib/types/Game";
import { ObjectId, WithId, Document } from "mongodb";

const COLLECTION_NAME = "games";

// Type pour un jeu dans MongoDB (avec _id)
export type GameDocument = Omit<Game, "id"> & { _id: ObjectId };

// Convertir un document MongoDB en Game
function toGame(doc: WithId<Document>): Game {
  return {
    id: doc._id.toString(),
    name: doc.name,
    slug: doc.slug,
    icon: doc.icon,
    banner: doc.banner,
    description: doc.description,
    type: doc.type,
    featuredLairs: doc.featuredLairs || [],
    gallery: doc.gallery || [],
    color: doc.color || '#FF6900',
    note: doc.note || {},
    longDescription: doc.longDescription || "",
    images: doc.images || {},
    links: doc.links || {},
    metadata: doc.metadata || {},
    formats: doc.formats || {},
    stats: doc.stats || {
      communityRating: 0,
      popularityScore: 0,
    },
    features: doc.features || {},
  };
}

// Convertir un Game en document MongoDB (sans id)
function toDocument(game: Omit<Game, "id">): Omit<GameDocument, "_id"> {
  return {
    name: game.name,
    slug: game.slug,
    icon: game.icon,
    banner: game.banner,
    description: game.description,
    longDescription: game.longDescription,
    type: game.type,
    featuredLairs: game.featuredLairs || [],
    images: game.images,
    gallery: game.gallery,
    color: game.color,
    note: game.note,
    links: game.links,
    metadata: game.metadata,
    formats: game.formats,
    stats: game.stats,
    features: game.features,
  };
}

export async function getAllGames(): Promise<Game[]> {
  
  const games = await db.collection(COLLECTION_NAME).find({}).toArray();
  return games.map(toGame);
}

export async function getGameById(id: string): Promise<Game | null> {
  
  const game = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(id) });
  return game ? toGame(game) : null;
}

/**
 * Jeux correspondant à une liste d'identifiants, rendus dans l'ordre demandé.
 *
 * L'ordre compte : celui de `User.games` est celui dans lequel le joueur a
 * suivi ses jeux, quand Mongo rendrait les documents dans le sien. Les
 * identifiants inconnus ou mal formés sont ignorés plutôt que de faire échouer
 * la lecture — un jeu supprimé peut rester inscrit dans la liste d'un
 * utilisateur.
 */
export async function getGamesByIds(ids: string[]): Promise<Game[]> {
  const objectIds = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (objectIds.length === 0) return [];

  const found = await db.collection(COLLECTION_NAME).find({ _id: { $in: objectIds } }).toArray();
  const byId = new Map(found.map((doc) => [doc._id.toString(), toGame(doc)]));

  return ids.map((id) => byId.get(id)).filter((game): game is Game => game !== undefined);
}

export async function getGameBySlugOrId(slugOrId: string): Promise<Game | null> {
  // Try to find by slug first
  let game = await db.collection(COLLECTION_NAME).findOne({ slug: slugOrId });

  // If not found and slugOrId is a valid ObjectId, try by ID
  if (!game && ObjectId.isValid(slugOrId)) {
    game = await db.collection(COLLECTION_NAME).findOne({ _id: new ObjectId(slugOrId) });
  }

  return game ? toGame(game) : null;
}

export async function createGame(game: Omit<Game, "id">): Promise<Game> {
  
  const doc = toDocument(game);
  const result = await db.collection(COLLECTION_NAME).insertOne(doc);
  
  return {
    id: result.insertedId.toString(),
    ...game,
  };
}

export async function updateGame(id: string, game: Partial<Omit<Game, "id">>): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: new ObjectId(id) },
    { $set: game }
  );
  
  return result.modifiedCount > 0;
}

export async function deleteGame(id: string): Promise<boolean> {
  
  const result = await db.collection(COLLECTION_NAME).deleteOne({ _id: new ObjectId(id) });
  return result.deletedCount > 0;
}
