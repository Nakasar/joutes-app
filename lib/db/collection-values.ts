import 'server-only';

import db from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getMarketPrices } from "@/lib/db/card-prices";
import { sumOwnedCardPrices, type CollectionValue } from "@/lib/collection/value";
import { ownerField, ownerMatch, type CollectionOwner } from "@/lib/db/collection-owner";

/**
 * Valeur estimée d'une collection, un document par (propriétaire, jeu).
 *
 * Elle est **écrite** plutôt que recalculée à chaque affichage, comme celle
 * d'un booster : additionner les prix de milliers d'exemplaires à chaque
 * ouverture de l'écran coûterait cher pour un chiffre qui ne bouge qu'au
 * rythme des imports de prix (cf. docs/CARD_PRICES.md). Et surtout, un relevé
 * daté se compare — d'un mois à l'autre, d'un jeu à l'autre — là où un total
 * recalculé en continu ne dit jamais de quand il parle.
 *
 * Le total de la collection, lui, n'est pas stocké : il se déduit des valeurs
 * par jeu (`totalCollectionValue`). Deux nombres écrits séparément finissent
 * par se contredire, et c'est le total qui aurait tort en silence.
 */

const COLLECTION_NAME = "collection-values";

type CollectionValueDoc = {
  userId?: ObjectId;
  playGroupId?: ObjectId;
  gameId: ObjectId;
  amount: number;
  currency: string;
  copies: number;
  pricedCopies: number;
  computedAt: Date;
};

const collection = () => db.collection<CollectionValueDoc>(COLLECTION_NAME);

let indexesReady: Promise<void> | null = null;

/**
 * Un seul document de valeur par (propriétaire, jeu) : sans cette unicité, deux
 * recalculs lancés ensemble — le bouton global et celui d'un jeu — laisseraient
 * deux valeurs concurrentes, et la lecture en prendrait une au hasard.
 *
 * Les deux index sont partiels : un document de groupe n'a pas de `userId`, et
 * un index unique sur un champ absent ferait collisionner tous les groupes
 * entre eux sur un même jeu.
 *
 * L'échec n'est pas mémorisé : la tentative suivante réessaie plutôt que de
 * condamner l'instance pour une indisponibilité passagère.
 */
function ensureCollectionValueIndexes(): Promise<void> {
  if (!indexesReady) {
    indexesReady = Promise.all([
      collection().createIndex(
        { userId: 1, gameId: 1 },
        { unique: true, partialFilterExpression: { userId: { $exists: true } }, name: "userId_gameId_unique" }
      ),
      collection().createIndex(
        { playGroupId: 1, gameId: 1 },
        { unique: true, partialFilterExpression: { playGroupId: { $exists: true } }, name: "playGroupId_gameId_unique" }
      ),
    ])
      .then(() => undefined)
      .catch((error: unknown) => {
        indexesReady = null;
        console.error("Impossible de créer les index des valeurs de collection:", error);
        throw error;
      });
  }
  return indexesReady;
}

function toCollectionValue(doc: CollectionValueDoc): CollectionValue {
  return {
    amount: doc.amount,
    currency: doc.currency,
    copies: doc.copies,
    pricedCopies: doc.pricedCopies,
    computedAt: doc.computedAt.toISOString(),
  };
}

/**
 * Valeurs déjà calculées pour ces jeux, par identifiant de jeu. Un jeu jamais
 * estimé est absent : c'est ce qui distingue « pas encore calculé » de
 * « aucune carte cotée », qui vaut zéro et le dit.
 */
export async function getCollectionValues(
  owner: CollectionOwner,
  gameIds: ObjectId[]
): Promise<Map<string, CollectionValue>> {
  if (gameIds.length === 0) {
    return new Map();
  }

  const docs = await collection()
    .find({ ...ownerMatch(owner), gameId: { $in: gameIds } })
    .toArray();

  return new Map(docs.map((doc) => [doc.gameId.toString(), toCollectionValue(doc)]));
}

/**
 * Jeux à réestimer lors d'un recalcul global : ceux dont une carte est
 * possédée, **plus ceux qui portent déjà une valeur**.
 *
 * Sans ce second groupe, un jeu vidé de ses cartes garderait sa dernière
 * valeur pour toujours : il ne possède plus rien, donc plus rien ne le
 * réestime, et le total continuerait d'inclure une collection qui n'existe
 * plus. Réestimé, il tombe à zéro comme il se doit.
 */
export async function gameIdsToRevalue(
  owner: CollectionOwner,
  ownedGameIds: ObjectId[]
): Promise<ObjectId[]> {
  const valued = await collection()
    .find(ownerMatch(owner), { projection: { _id: 0, gameId: 1 } })
    .toArray();

  // Deux `ObjectId` égaux sont deux objets distincts : la clé de
  // dédoublonnage est leur écriture.
  const byKey = new Map<string, ObjectId>();
  for (const gameId of [...ownedGameIds, ...valued.map((doc) => doc.gameId)]) {
    byKey.set(gameId.toString(), gameId);
  }

  return [...byKey.values()];
}

/** Exemplaires possédés d'un jeu, regroupés par carte du catalogue. */
async function getOwnedCopiesByCard(
  owner: CollectionOwner,
  gameId: ObjectId
): Promise<{ cardId: string; copies: number }[]> {
  const rows = await db
    .collection("collection-cards")
    .aggregate<{ _id: string; copies: number }>([
      { $match: ownerMatch(owner) },
      { $lookup: { from: "cards", localField: "cardId", foreignField: "id", as: "c" } },
      // `cards.id` n'est pas strictement unique (quelques jetons et promos le
      // partagent) : on ne garde qu'une correspondance par exemplaire possédé,
      // sinon un même exemplaire serait compté — et donc valorisé — plusieurs
      // fois.
      { $addFields: { c: { $arrayElemAt: ["$c", 0] } } },
      { $match: { "c.gameId": gameId } },
      { $group: { _id: "$c.id", copies: { $sum: 1 } } },
    ])
    .toArray();

  return rows.map((row) => ({ cardId: row._id, copies: row.copies }));
}

/**
 * Recalcule la valeur d'un jeu à partir des prix du moment et l'écrit.
 *
 * Le calcul est une action explicite du propriétaire : les prix ne sont
 * relevés que de temps en temps, et une valeur datée du dernier clic se
 * comprend mieux qu'un total qui bouge tout seul.
 */
export async function computeGameCollectionValue(
  owner: CollectionOwner,
  gameId: string
): Promise<CollectionValue> {
  await ensureCollectionValueIndexes();

  const gameObjId = new ObjectId(gameId);
  const owned = await getOwnedCopiesByCard(owner, gameObjId);
  const prices = await getMarketPrices(gameObjId, owned.map((entry) => entry.cardId));

  const value = sumOwnedCardPrices(
    owned.map((entry) => ({ copies: entry.copies, price: prices.get(entry.cardId) })),
    new Date()
  );

  await collection().updateOne(
    { ...ownerMatch(owner), gameId: gameObjId },
    {
      $set: {
        amount: value.amount,
        currency: value.currency,
        copies: value.copies,
        pricedCopies: value.pricedCopies,
        computedAt: new Date(value.computedAt),
      },
      $setOnInsert: { [ownerField(owner)]: new ObjectId(owner.id), gameId: gameObjId },
    },
    { upsert: true }
  );

  return value;
}

/**
 * Recalcule la valeur de tous les jeux dont le propriétaire possède au moins
 * une carte, et rend les valeurs par identifiant de jeu.
 *
 * Les jeux sont traités l'un après l'autre : chacun lit ses exemplaires puis
 * ses prix, et lancer tout de front ne ferait que multiplier les requêtes
 * simultanées sur la base pour un bouton qu'on presse une fois par mois.
 */
export async function computeCollectionValues(
  owner: CollectionOwner,
  gameIds: ObjectId[]
): Promise<Map<string, CollectionValue>> {
  const values = new Map<string, CollectionValue>();

  for (const gameId of gameIds) {
    values.set(gameId.toString(), await computeGameCollectionValue(owner, gameId.toString()));
  }

  return values;
}
