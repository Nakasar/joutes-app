import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId, WithId, Document } from "mongodb";
import { Cube, CubeCard, CubeDrawConfig, CubePack, CubeVisibility } from "@/lib/types/Cube";
import { getUserById } from "@/lib/db/users";

export const CUBES_COLLECTION = "cubes";
export const CUBE_PACKS_COLLECTION = "cube-packs";
export const CUBE_CARDS_COLLECTION = "cube-cards";

function toCube(doc: WithId<Document>, packsCount = 0, cardsCount = 0): Cube {
  return {
    id: doc._id.toString(),
    ownerId: doc.ownerId.toString(),
    gameId: doc.gameId.toString(),
    gameName: doc.gameName || undefined,
    gameSlug: doc.gameSlug || undefined,
    name: doc.name,
    description: doc.description || undefined,
    visibility: doc.visibility || "private",
    draw: doc.draw || undefined,
    packsCount,
    cardsCount,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function toCubePack(doc: WithId<Document>, cardsCount = 0): CubePack {
  return {
    id: doc._id.toString(),
    cubeId: doc.cubeId.toString(),
    name: doc.name || undefined,
    type: doc.type || undefined,
    cardsCount,
    createdAt: doc.createdAt,
  };
}

function toCubeCard(doc: WithId<Document>): CubeCard {
  return {
    id: doc._id.toString(),
    cubeId: doc.cubeId.toString(),
    packId: doc.packId.toString(),
    cardId: doc.cardId,
    name: doc.name,
    setCode: doc.setCode,
    collectorNumber: doc.collectorNumber,
    image: doc.image,
    createdAt: doc.createdAt,
  };
}

/**
 * Les compteurs de paquets et de cartes sont recalculés à la lecture plutôt que
 * tenus à jour sur le document du cube : ils ne peuvent pas dériver, et les
 * listes en affichent toujours la valeur exacte.
 */
async function attachCounts(docs: WithId<Document>[]): Promise<Cube[]> {
  if (docs.length === 0) {
    return [];
  }

  const ids = docs.map((doc) => doc._id);
  const [packCounts, cardCounts] = await Promise.all([
    db.collection(CUBE_PACKS_COLLECTION).aggregate<{ _id: ObjectId; count: number }>([
      { $match: { cubeId: { $in: ids } } },
      { $group: { _id: "$cubeId", count: { $sum: 1 } } },
    ]).toArray(),
    db.collection(CUBE_CARDS_COLLECTION).aggregate<{ _id: ObjectId; count: number }>([
      { $match: { cubeId: { $in: ids } } },
      { $group: { _id: "$cubeId", count: { $sum: 1 } } },
    ]).toArray(),
  ]);

  const packsById = new Map(packCounts.map((row) => [row._id.toString(), row.count]));
  const cardsById = new Map(cardCounts.map((row) => [row._id.toString(), row.count]));

  return docs.map((doc) => toCube(
    doc,
    packsById.get(doc._id.toString()) ?? 0,
    cardsById.get(doc._id.toString()) ?? 0,
  ));
}

/** Tous les cubes d'un utilisateur, quelle que soit leur visibilité. */
export async function getCubesForOwner(ownerId: string): Promise<Cube[]> {
  const docs = await db
    .collection(CUBES_COLLECTION)
    .find({ ownerId: new ObjectId(ownerId) })
    .sort({ updatedAt: -1 })
    .toArray();

  return attachCounts(docs);
}

/**
 * Cubes publics, tous propriétaires confondus, éventuellement restreints à un
 * jeu. Les cubes « non référencés » en sont exclus : c'est précisément ce qui
 * les distingue des publics.
 */
export async function getPublicCubes({ gameId, limit = 50 }: { gameId?: string; limit?: number } = {}): Promise<Cube[]> {
  const query: Record<string, unknown> = { visibility: "public" };
  if (gameId) {
    query.gameId = new ObjectId(gameId);
  }

  const docs = await db
    .collection(CUBES_COLLECTION)
    .find(query)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();

  return attachCounts(docs);
}

export async function getCubeById(cubeId: string): Promise<Cube | null> {
  if (!ObjectId.isValid(cubeId)) {
    return null;
  }

  const doc = await db.collection(CUBES_COLLECTION).findOne({ _id: new ObjectId(cubeId) });
  if (!doc) {
    return null;
  }

  const [cube] = await attachCounts([doc]);
  return cube;
}

export async function createCube(
  ownerId: string,
  game: { id: string; name: string; slug?: string },
  input: { name: string; description?: string; visibility?: CubeVisibility },
): Promise<Cube> {
  const now = new Date();
  // Les champs vides sont omis plutôt qu'insérés : le pilote stocke `undefined`
  // sous forme de `null`, et un document sans la clé se relit plus simplement.
  const document = {
    ownerId: new ObjectId(ownerId),
    gameId: new ObjectId(game.id),
    // Le nom et le slug du jeu sont recopiés pour afficher une liste de cubes
    // sans relire la collection `games` à chaque ligne.
    gameName: game.name,
    ...(game.slug ? { gameSlug: game.slug } : {}),
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    visibility: input.visibility || "private",
    createdAt: now,
    updatedAt: now,
  };

  const result = await db.collection(CUBES_COLLECTION).insertOne(document);

  return toCube({ _id: result.insertedId, ...document });
}

export async function updateCube(
  cubeId: string,
  updates: { name?: string; description?: string; visibility?: CubeVisibility; draw?: CubeDrawConfig },
): Promise<Cube | null> {
  if (!ObjectId.isValid(cubeId)) {
    return null;
  }

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined) {
    set.name = updates.name;
  }
  if (updates.visibility !== undefined) {
    set.visibility = updates.visibility;
  }
  if (updates.draw !== undefined) {
    set.draw = updates.draw;
  }

  const unset: Record<string, ''> = {};
  // Une description vidée est retirée du document plutôt que stockée vide, pour
  // que les cubes sans description restent tous équivalents.
  if (updates.description !== undefined) {
    if (updates.description) {
      set.description = updates.description;
    } else {
      unset.description = '';
    }
  }

  await db.collection(CUBES_COLLECTION).updateOne(
    { _id: new ObjectId(cubeId) },
    {
      $set: set,
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
  );

  return getCubeById(cubeId);
}

export async function deleteCube(cubeId: string): Promise<void> {
  const _id = new ObjectId(cubeId);
  await db.collection(CUBE_CARDS_COLLECTION).deleteMany({ cubeId: _id });
  await db.collection(CUBE_PACKS_COLLECTION).deleteMany({ cubeId: _id });
  await db.collection(CUBES_COLLECTION).deleteOne({ _id });
}

export function getCubeAccess(cube: Cube, userId?: string): { canView: boolean; canEdit: boolean } {
  const isOwner = Boolean(userId) && cube.ownerId === userId;

  return {
    // Un cube non référencé se consulte par son lien : seul le privé est fermé.
    canView: cube.visibility !== "private" || isOwner,
    canEdit: isOwner,
  };
}

export type CubeOwnerInfo = { label: string; href: string };

/** Nom affichable et lien de profil du propriétaire, pour les cubes consultés par un tiers. */
export async function getCubeOwnerInfo(cube: Pick<Cube, "ownerId">): Promise<CubeOwnerInfo | null> {
  const owner = await getUserById(cube.ownerId);
  if (!owner) {
    return null;
  }

  const hasTag = !!(owner.displayName && owner.discriminator);
  const label = hasTag ? `${owner.displayName}#${owner.discriminator}` : owner.username;
  const tagForUrl = hasTag ? `${owner.displayName}${owner.discriminator}` : owner.username;

  return { label, href: `/users/${tagForUrl}` };
}

export async function getCubePacks(cubeId: string): Promise<CubePack[]> {
  if (!ObjectId.isValid(cubeId)) {
    return [];
  }

  const docs = await db
    .collection(CUBE_PACKS_COLLECTION)
    .find({ cubeId: new ObjectId(cubeId) })
    .sort({ createdAt: 1 })
    .toArray();

  if (docs.length === 0) {
    return [];
  }

  const counts = await db.collection(CUBE_CARDS_COLLECTION).aggregate<{ _id: ObjectId; count: number }>([
    { $match: { packId: { $in: docs.map((doc) => doc._id) } } },
    { $group: { _id: "$packId", count: { $sum: 1 } } },
  ]).toArray();
  const countsById = new Map(counts.map((row) => [row._id.toString(), row.count]));

  return docs.map((doc) => toCubePack(doc, countsById.get(doc._id.toString()) ?? 0));
}

export async function getCubePack(cubeId: string, packId: string): Promise<CubePack | null> {
  if (!ObjectId.isValid(cubeId) || !ObjectId.isValid(packId)) {
    return null;
  }

  const doc = await db.collection(CUBE_PACKS_COLLECTION).findOne({
    _id: new ObjectId(packId),
    cubeId: new ObjectId(cubeId),
  });
  if (!doc) {
    return null;
  }

  const cardsCount = await db.collection(CUBE_CARDS_COLLECTION).countDocuments({ packId: doc._id });

  return toCubePack(doc, cardsCount);
}

export async function createCubePack(cubeId: string, input: { name?: string; type?: string }): Promise<CubePack> {
  const document = {
    cubeId: new ObjectId(cubeId),
    ...(input.name ? { name: input.name } : {}),
    ...(input.type ? { type: input.type } : {}),
    createdAt: new Date(),
  };

  const result = await db.collection(CUBE_PACKS_COLLECTION).insertOne(document);
  await touchCube(cubeId);

  return toCubePack({ _id: result.insertedId, ...document });
}

export async function updateCubePack(
  cubeId: string,
  packId: string,
  updates: { name?: string; type?: string },
): Promise<CubePack | null> {
  if (!ObjectId.isValid(cubeId) || !ObjectId.isValid(packId)) {
    return null;
  }

  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  for (const field of ['name', 'type'] as const) {
    const value = updates[field];
    if (value === undefined) {
      continue;
    }
    if (value) {
      set[field] = value;
    } else {
      unset[field] = '';
    }
  }

  if (Object.keys(set).length === 0 && Object.keys(unset).length === 0) {
    return getCubePack(cubeId, packId);
  }

  await db.collection(CUBE_PACKS_COLLECTION).updateOne(
    { _id: new ObjectId(packId), cubeId: new ObjectId(cubeId) },
    {
      ...(Object.keys(set).length > 0 ? { $set: set } : {}),
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    },
  );
  await touchCube(cubeId);

  return getCubePack(cubeId, packId);
}

export async function deleteCubePack(cubeId: string, packId: string): Promise<void> {
  const _id = new ObjectId(packId);
  await db.collection(CUBE_CARDS_COLLECTION).deleteMany({ packId: _id });
  await db.collection(CUBE_PACKS_COLLECTION).deleteOne({ _id, cubeId: new ObjectId(cubeId) });
  await touchCube(cubeId);
}

export async function getCubePackCards(packId: string): Promise<CubeCard[]> {
  if (!ObjectId.isValid(packId)) {
    return [];
  }

  const docs = await db
    .collection(CUBE_CARDS_COLLECTION)
    .find({ packId: new ObjectId(packId) })
    .sort({ createdAt: 1 })
    .toArray();

  return docs.map(toCubeCard);
}

export async function addCardToCubePack(
  cubeId: string,
  packId: string,
  card: { cardId: string; name: string; setCode: string; collectorNumber: string; image: string },
): Promise<CubeCard> {
  const document = {
    // `cubeId` est recopié sur chaque carte : les statistiques du cube tiennent
    // alors en une requête, sans passer par la liste de ses paquets.
    cubeId: new ObjectId(cubeId),
    packId: new ObjectId(packId),
    ...card,
    createdAt: new Date(),
  };

  const result = await db.collection(CUBE_CARDS_COLLECTION).insertOne(document);
  await touchCube(cubeId);

  return toCubeCard({ _id: result.insertedId, ...document });
}

export async function removeCardFromCubePack(cubeId: string, packId: string, cardEntryId: string): Promise<boolean> {
  if (!ObjectId.isValid(cardEntryId)) {
    return false;
  }

  const result = await db.collection(CUBE_CARDS_COLLECTION).deleteOne({
    _id: new ObjectId(cardEntryId),
    packId: new ObjectId(packId),
  });
  if (result.deletedCount > 0) {
    await touchCube(cubeId);
  }

  return result.deletedCount > 0;
}

/** Le cube remonte en tête des listes triées par date dès qu'un de ses paquets bouge. */
async function touchCube(cubeId: string): Promise<void> {
  await db.collection(CUBES_COLLECTION).updateOne(
    { _id: new ObjectId(cubeId) },
    { $set: { updatedAt: new Date() } },
  );
}
