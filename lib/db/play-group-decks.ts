import type { UpdateFilter } from "mongodb";

import db from "@/lib/mongodb";
import type { PlayGroupDeck } from "@/lib/types/PlayGroupDeck";

/**
 * La bibliothèque de decks des groupes : un document par deck partagé à un
 * groupe. Les règles (qui ajoute, qui retire) sont dans
 * `lib/play-groups/decks.ts` ; ce module ne fait qu'écrire et lire.
 *
 * Index : `lib/db/indexes/users.ts`, section groupes de jeu.
 */
export const PLAY_GROUP_DECKS_COLLECTION = "playGroupDecks";

const collection = db.collection<PlayGroupDeck>(PLAY_GROUP_DECKS_COLLECTION);

function toLink(doc: PlayGroupDeck): PlayGroupDeck {
  return {
    playGroupId: doc.playGroupId,
    deckId: doc.deckId,
    gameId: doc.gameId,
    ownerId: doc.ownerId,
    addedBy: doc.addedBy,
    addedAt: doc.addedAt,
    ...(doc.pinnedAt ? { pinnedAt: doc.pinnedAt } : {}),
    ...(doc.pinNote ? { pinNote: doc.pinNote } : {}),
  };
}

/**
 * Partage des decks au groupe. Un deck déjà présent ne bouge pas : ni sa date
 * d'ajout, ni son épinglage. Renvoie le nombre de decks réellement ajoutés.
 */
export async function addPlayGroupDecks(
  playGroupId: string,
  decks: { id: string; gameId: string; playerId: string }[],
  addedBy: string,
): Promise<number> {
  if (decks.length === 0) {
    return 0;
  }

  const addedAt = new Date().toISOString();
  const result = await collection.bulkWrite(
    decks.map((deck) => ({
      updateOne: {
        filter: { playGroupId, deckId: deck.id },
        update: {
          $setOnInsert: {
            playGroupId,
            deckId: deck.id,
            gameId: deck.gameId,
            ownerId: deck.playerId,
            addedBy,
            addedAt,
          },
        },
        upsert: true,
      },
    })),
  );

  return result.upsertedCount;
}

export async function removePlayGroupDeck(playGroupId: string, deckId: string): Promise<boolean> {
  const result = await collection.deleteOne({ playGroupId, deckId });

  return result.deletedCount === 1;
}

export async function setPlayGroupDeckPin(
  playGroupId: string,
  deckId: string,
  pin: { note?: string } | null,
): Promise<boolean> {
  let update: UpdateFilter<PlayGroupDeck>;
  if (!pin) {
    update = { $unset: { pinnedAt: "", pinNote: "" } };
  } else if (pin.note) {
    update = { $set: { pinnedAt: new Date().toISOString(), pinNote: pin.note } };
  } else {
    update = { $set: { pinnedAt: new Date().toISOString() }, $unset: { pinNote: "" } };
  }
  const result = await collection.updateOne({ playGroupId, deckId }, update);

  return result.matchedCount === 1;
}

export async function getPlayGroupDeck(playGroupId: string, deckId: string): Promise<PlayGroupDeck | null> {
  const doc = await collection.findOne({ playGroupId, deckId });

  return doc ? toLink(doc) : null;
}

export async function listPlayGroupDecks(playGroupId: string): Promise<PlayGroupDeck[]> {
  const docs = await collection.find({ playGroupId }).toArray();

  return docs.map(toLink);
}

/** Les groupes où ce deck est partagé. */
export async function listPlayGroupIdsForDeck(deckId: string): Promise<string[]> {
  const docs = await collection.find({ deckId }, { projection: { playGroupId: 1 } }).toArray();

  return docs.map((doc) => doc.playGroupId);
}

/**
 * Ce deck est-il partagé dans un groupe dont le lecteur est membre ?
 *
 * C'est ce qui ouvre un deck privé à un membre du groupe. Le lecteur doit être
 * membre **aujourd'hui** : quitter le groupe referme les decks qu'on y lisait.
 */
export async function isDeckSharedWithUser(deckId: string, userId: string): Promise<boolean> {
  const groupIds = await listPlayGroupIdsForDeck(deckId);
  if (groupIds.length === 0) {
    return false;
  }

  const count = await db
    .collection("playGroups")
    .countDocuments({ id: { $in: groupIds }, "members.userId": userId }, { limit: 1 });

  return count > 0;
}

/** Un membre qui quitte le groupe emporte ses decks. */
export async function removeOwnerPlayGroupDecks(playGroupId: string, ownerId: string): Promise<number> {
  const result = await collection.deleteMany({ playGroupId, ownerId });

  return result.deletedCount;
}

/** Un deck supprimé quitte toutes les bibliothèques. */
export async function removeDeckFromPlayGroups(deckId: string): Promise<number> {
  const result = await collection.deleteMany({ deckId });

  return result.deletedCount;
}
