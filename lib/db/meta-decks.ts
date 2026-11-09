import "server-only";

import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { createDeck, findAvailableDeckName, getDeckById } from "@/lib/db/decks";
import { metaDeckDescription, planMetaDeckEdit, type MetaDeckEdit } from "@/lib/meta/edit";
import { formatPlacement } from "@/lib/meta/import-input";
import { mapWithConcurrency, resolveMetaImport, type MetaImportRow } from "@/lib/meta/import";
import { toPublicDeckMeta, type Deck, type DeckMeta } from "@/lib/types/Deck";
import type { Game } from "@/lib/types/Game";

const COLLECTION_NAME = "decks";

export type MetaImportRequest = {
  game: Game;
  input: string;
  source: string;
  eventDate: Date;
  format?: string;
  /**
   * Le nombre de decks que la vérification annonçait. L'import relit le
   * collage (Piltover compris) : s'il n'en trouve plus autant, rien ne
   * s'écrit, pour qu'on n'importe jamais autre chose que ce qu'on a vu.
   */
  expected?: number;
};

export type MetaImportResult =
  | { ok: false; changed: true; rows: MetaImportRow[] }
  | {
  ok: true;
  batchId: string;
  created: { deckId: string; name: string }[];
  rows: MetaImportRow[];
};

/** Créations simultanées : assez pour ne pas attendre chaque deck, peu pour ne pas saturer Mongo. */
const CREATE_CONCURRENCY = 4;

/** Ce que le navigateur reçoit d'une ligne : tout sauf le contenu lu, qui reste côté serveur. */
export type PublicMetaImportRow = Omit<MetaImportRow, "cards" | "contentHash">;

export function toPublicRows(rows: MetaImportRow[]): PublicMetaImportRow[] {
  return rows.map(({ cards: _cards, contentHash: _hash, ...row }) => row);
}

/**
 * Importe les decks prêts ou à vérifier d'un collage, en decks publics.
 *
 * Les doublons et les erreurs sont laissés de côté. Chaque deck appartient à `playerId` (celui qui
 * importe) et s'affiche au nom du joueur, ou de « Méta Joutes ».
 */
export async function importMetaDecks(request: MetaImportRequest, playerId: string): Promise<MetaImportResult> {
  const { game, input, source, eventDate, format, expected } = request;
  const rows = await resolveMetaImport(game, input, { source });
  const importable = rows.filter((row) => (row.status === "ready" || row.status === "warning") && row.cards);
  if (expected !== undefined && importable.length !== expected) {
    return { ok: false, changed: true, rows };
  }

  const batchId = new ObjectId().toString();
  const addedAt = new Date();

  // Les noms se choisissent d'abord, un par un : deux decks du lot peuvent
  // porter le même (« Jinx · Regional Lyon » sans classement), et deux
  // recherches simultanées rendraient le même nom libre.
  const taken = new Set<string>();
  const named: { row: MetaImportRow; name: string }[] = [];
  for (const row of importable) {
    let name = await findAvailableDeckName(playerId, row.name ?? source);
    for (let suffix = 2; taken.has(name); suffix += 1) {
      name = await findAvailableDeckName(playerId, `${(row.name ?? source).slice(0, 80)} (${suffix})`);
    }
    taken.add(name);
    named.push({ row, name });
  }

  const created = await mapWithConcurrency(named, CREATE_CONCURRENCY, async ({ row, name }) => {
    const meta: DeckMeta = {
      imported: true,
      source,
      eventDate,
      addedBy: playerId,
      addedAt,
      batchId,
      ...(row.placement ? { placement: row.placement } : {}),
      ...(row.pilot ? { pilot: row.pilot } : {}),
      ...(row.sourceRef ? { sourceRef: row.sourceRef } : {}),
      ...(row.contentHash ? { contentHash: row.contentHash } : {}),
    };

    const deck = await createDeck({
      playerId,
      gameId: game.id,
      name,
      ...(row.url ? { url: row.url } : {}),
      description: metaDeckDescription({ source, placement: row.placement, pilot: row.pilot }),
      cards: row.cards,
      ...(format ? { format } : {}),
      visibility: "public",
      meta,
    });
    return { deckId: deck.id, name: deck.name };
  });

  return { ok: true, batchId, created, rows };
}

/**
 * Marque le deck public d'un joueur comme deck méta : il reste le sien et
 * garde son auteur, mais entre dans les statistiques.
 */
export async function markDeckAsMeta(
  deckId: string,
  details: { source: string; eventDate: Date; placement?: string },
  addedBy: string
): Promise<{ ok: true; deck: Deck } | { ok: false; error: string }> {
  const deck = await getDeckById(deckId);
  if (!deck) return { ok: false, error: "Deck introuvable." };
  if (deck.visibility !== "public") return { ok: false, error: "Seul un deck public peut compter dans la méta." };
  if (deck.meta?.imported) return { ok: false, error: "Ce deck a été importé : modifiez-le depuis la gestion de la méta." };

  // Pas d'empreinte : le joueur peut encore modifier son deck, elle ne
  // décrirait bientôt plus son contenu. Seuls les decks importés, figés,
  // servent à reconnaître un doublon.
  const placement = formatPlacement(details.placement);
  const meta: DeckMeta = {
    imported: false,
    source: details.source,
    eventDate: details.eventDate,
    addedBy,
    addedAt: new Date(),
    ...(placement ? { placement } : {}),
  };

  await db.collection(COLLECTION_NAME).updateOne({ _id: new ObjectId(deckId) }, { $set: { meta } });
  return { ok: true, deck: { ...deck, meta: toPublicDeckMeta(meta) } };
}

/**
 * Modifie la provenance d'un deck méta : tournoi, date, classement, et pour
 * un deck importé son nom et son joueur. Rend le jeu du deck, pour invalider
 * ses statistiques.
 */
export async function updateMetaDeck(
  deckId: string,
  edit: MetaDeckEdit
): Promise<{ ok: true; gameId: string } | { ok: false; error: string }> {
  if (!ObjectId.isValid(deckId)) return { ok: false, error: "Deck introuvable." };

  const _id = new ObjectId(deckId);
  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id, meta: { $exists: true } }, { projection: { gameId: 1, playerId: 1, name: 1, description: 1, meta: 1 } });
  if (!doc) return { ok: false, error: "Deck introuvable." };

  const plan = planMetaDeckEdit({ name: doc.name, description: doc.description, meta: doc.meta }, edit);
  if (plan.rename) {
    const taken = await db.collection(COLLECTION_NAME).findOne({ playerId: doc.playerId, name: plan.rename, _id: { $ne: _id } });
    if (taken) return { ok: false, error: "Un autre deck du même compte porte déjà ce nom." };
  }

  await db.collection(COLLECTION_NAME).updateOne(
    { _id },
    { $set: { ...plan.$set, updatedAt: new Date() }, ...(Object.keys(plan.$unset).length > 0 ? { $unset: plan.$unset } : {}) }
  );
  return { ok: true, gameId: doc.gameId };
}

/**
 * Retire un deck de la méta : un deck importé est supprimé, le deck d'un
 * joueur perd seulement son marquage. Rend le jeu du deck, pour invalider ses
 * statistiques.
 */
export async function removeMetaDeck(deckId: string): Promise<{ gameId: string; deleted: boolean } | null> {
  if (!ObjectId.isValid(deckId)) return null;

  const doc = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: new ObjectId(deckId), meta: { $exists: true } }, { projection: { gameId: 1, meta: 1 } });
  if (!doc) return null;

  if (doc.meta?.imported) {
    await db.collection(COLLECTION_NAME).deleteOne({ _id: doc._id });
    return { gameId: doc.gameId, deleted: true };
  }

  await db.collection(COLLECTION_NAME).updateOne({ _id: doc._id }, { $unset: { meta: "" } });
  return { gameId: doc.gameId, deleted: false };
}

/** Retire d'un coup tous les decks d'un lot d'import. */
export async function removeMetaBatch(batchId: string): Promise<{ gameId?: string; deleted: number }> {
  const first = await db
    .collection(COLLECTION_NAME)
    .findOne({ "meta.batchId": batchId }, { projection: { gameId: 1 } });
  if (!first) return { deleted: 0 };

  const result = await db
    .collection(COLLECTION_NAME)
    .deleteMany({ "meta.batchId": batchId, "meta.imported": true });
  return { gameId: first.gameId, deleted: result.deletedCount };
}

export type MetaSourceSummary = {
  source: string;
  decks: number;
  lastEventDate: Date;
};

/** Les sources de la méta d'un jeu, les plus récentes d'abord : le filtre de la liste des decks importés. */
export async function listMetaSources(gameId: string): Promise<MetaSourceSummary[]> {
  const rows = await db
    .collection(COLLECTION_NAME)
    .aggregate<{ _id: string; decks: number; lastEventDate: Date }>([
      { $match: { gameId, meta: { $exists: true } } },
      { $group: { _id: "$meta.source", decks: { $sum: 1 }, lastEventDate: { $max: "$meta.eventDate" } } },
      { $sort: { lastEventDate: -1, _id: 1 } },
      { $limit: 200 },
    ])
    .toArray();

  return rows.map((row) => ({ source: row._id, decks: row.decks, lastEventDate: row.lastEventDate }));
}

/**
 * Le lot d'import d'une source, quand tous ses decks importés en viennent :
 * c'est lui que « Annuler cet import » retire, toutes pages confondues.
 */
export async function getSingleSourceBatch(gameId: string, source: string): Promise<{ batchId: string; decks: number } | null> {
  const rows = await db
    .collection(COLLECTION_NAME)
    .aggregate<{ _id: string | null; decks: number }>([
      { $match: { gameId, "meta.source": source, "meta.imported": true } },
      { $group: { _id: "$meta.batchId", decks: { $sum: 1 } } },
      { $limit: 2 },
    ])
    .toArray();

  return rows.length === 1 && rows[0]._id ? { batchId: rows[0]._id, decks: rows[0].decks } : null;
}

/** Nombre de decks méta d'un jeu. */
export async function countMetaDecks(gameId: string): Promise<number> {
  return db.collection(COLLECTION_NAME).countDocuments({ gameId, meta: { $exists: true } });
}
