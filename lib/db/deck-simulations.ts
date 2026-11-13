import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import type { SimulationGame } from "@/lib/engine/simulation";
import type { DeckSimulation, DeckSimulationSummary } from "@/lib/types/DeckSimulation";

/**
 * Les séries de parties simulées pour évaluer un deck : un document par série,
 * les parties au fil de l'eau dans `games`. Les règles (ce qu'on accepte du
 * navigateur) sont dans les actions de la page Simuler ; ce module écrit et lit.
 *
 * Index : `lib/db/indexes/users.ts`, section simulations de decks.
 */
export const DECK_SIMULATIONS_COLLECTION = "deckSimulations";

type DeckSimulationDoc = Omit<DeckSimulation, "id"> & { _id: ObjectId };

const collection = db.collection<DeckSimulationDoc>(DECK_SIMULATIONS_COLLECTION);

function toSimulation(doc: DeckSimulationDoc): DeckSimulation {
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

function objectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && /^[a-f0-9]{24}$/i.test(id) ? new ObjectId(id) : null;
}

export async function insertDeckSimulation(simulation: Omit<DeckSimulation, "id">): Promise<string> {
  const result = await collection.insertOne({ _id: new ObjectId(), ...simulation });
  return result.insertedId.toString();
}

/** Une série de cette personne, ou `null`. */
export async function getDeckSimulation(id: string, userId: string): Promise<DeckSimulation | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const doc = await collection.findOne({ _id, userId });
  return doc ? toSimulation(doc) : null;
}

/** Ce qu'il faut pour vérifier un envoi de parties : le nombre visé et les adversaires possibles. */
export async function getDeckSimulationForRecord(
  id: string,
  userId: string,
): Promise<{ target: number; opponents: string[] } | null> {
  const _id = objectId(id);
  if (!_id) return null;
  const doc = await collection.findOne(
    { _id, userId },
    { projection: { target: 1, "pool.key": 1 } },
  );
  return doc ? { target: doc.target, opponents: doc.pool.map((deck) => deck.key) } : null;
}

/**
 * Ajoute des parties à une série. Une partie dont le rang y est déjà (envoi
 * répété après une coupure, deuxième onglet) est ignorée, les autres sont
 * écrites. Rend le nombre de parties ajoutées.
 */
export async function pushDeckSimulationGames(id: string, userId: string, games: SimulationGame[]): Promise<number> {
  const _id = objectId(id);
  if (!_id || games.length === 0) return 0;
  const before = await collection.findOneAndUpdate(
    { _id, userId },
    [
      {
        $set: {
          games: {
            $concatArrays: [
              "$games",
              {
                $filter: {
                  input: { $literal: games },
                  as: "g",
                  cond: { $not: [{ $in: ["$$g.n", "$games.n"] }] },
                },
              },
            ],
          },
          updatedAt: new Date().toISOString(),
        },
      },
    ],
    { projection: { "games.n": 1 }, returnDocument: "before" },
  );
  if (!before) return 0;
  const known = new Set(before.games.map((game) => game.n));
  return games.filter((game) => !known.has(game.n)).length;
}

/** Garde les `keep` séries les plus récentes de cette personne pour ce jeu, supprime les autres. */
export async function pruneDeckSimulations(userId: string, gameId: string, keep: number): Promise<number> {
  const old = await collection
    .find({ userId, gameId }, { projection: { _id: 1 } })
    .sort({ updatedAt: -1 })
    .skip(keep)
    .toArray();
  if (old.length === 0) return 0;
  const result = await collection.deleteMany({ _id: { $in: old.map((doc) => doc._id) }, userId });
  return result.deletedCount;
}

export async function setDeckSimulationTarget(id: string, userId: string, target: number): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  const result = await collection.updateOne(
    { _id, userId },
    { $set: { target, updatedAt: new Date().toISOString() } },
  );
  return result.matchedCount === 1;
}

export async function deleteDeckSimulation(id: string, userId: string): Promise<boolean> {
  const _id = objectId(id);
  if (!_id) return false;
  const result = await collection.deleteOne({ _id, userId });
  return result.deletedCount === 1;
}

/** Mes séries, les plus récentes d'abord, résumées. */
export async function listDeckSimulations(userId: string, gameId: string, limit = 20): Promise<DeckSimulationSummary[]> {
  const docs = await collection
    .aggregate<{
      _id: ObjectId;
      deck: { name: string; legend: string; key?: string };
      opponent: DeckSimulation["opponent"];
      first: { name: string } | null;
      level: DeckSimulation["level"];
      target: number;
      played: number;
      wins: number;
      losses: number;
      updatedAt: string;
    }>([
      { $match: { userId, gameId } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      {
        $project: {
          deck: { name: "$deck.name", legend: "$deck.legend", key: "$deck.key" },
          opponent: 1,
          first: { $arrayElemAt: [{ $map: { input: "$pool", as: "d", in: { name: "$$d.name" } } }, 0] },
          level: 1,
          target: 1,
          played: { $size: "$games" },
          wins: { $size: { $filter: { input: "$games", as: "g", cond: { $eq: ["$$g.win", true] } } } },
          losses: { $size: { $filter: { input: "$games", as: "g", cond: { $eq: ["$$g.win", false] } } } },
          updatedAt: 1,
        },
      },
    ])
    .toArray();
  return docs.map((doc) => ({
    id: doc._id.toString(),
    deckName: doc.deck.name,
    legend: doc.deck.legend,
    auto: doc.deck.key?.startsWith("auto:") ?? false,
    opponent: doc.opponent,
    opponentName: doc.opponent.kind === "fixed" ? (doc.first?.name ?? null) : null,
    level: doc.level,
    target: doc.target,
    played: doc.played,
    wins: doc.wins,
    losses: doc.losses,
    updatedAt: doc.updatedAt,
  }));
}
