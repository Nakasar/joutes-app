import "server-only";

import { ObjectId } from "mongodb";

import db from "@/lib/mongodb";
import { createDeck, findAvailableDeckName, getDeckById } from "@/lib/db/decks";
import { getDeckCardInfos } from "@/lib/db/deck-cards";
import { deckCardIds } from "@/lib/decks/contents";
import { deckFingerprint } from "@/lib/meta/fingerprint";
import { formatPlacement } from "@/lib/meta/import-input";
import { resolveMetaImport, type MetaImportRow } from "@/lib/meta/import";
import type { Deck, DeckMeta } from "@/lib/types/Deck";
import type { Game } from "@/lib/types/Game";

const COLLECTION_NAME = "decks";

export type MetaImportRequest = {
  game: Game;
  input: string;
  source: string;
  eventDate: Date;
  format?: string;
  /** Lignes du collage à laisser de côté, par leur position (`MetaImportRow.index`). */
  skip?: number[];
};

export type MetaImportResult = {
  batchId: string;
  created: { deckId: string; name: string }[];
  rows: MetaImportRow[];
};

/** Ce que le navigateur reçoit d'une ligne : tout sauf le contenu lu, qui reste côté serveur. */
export type PublicMetaImportRow = Omit<MetaImportRow, "cards" | "contentHash">;

export function toPublicRows(rows: MetaImportRow[]): PublicMetaImportRow[] {
  return rows.map(({ cards: _cards, contentHash: _hash, ...row }) => row);
}

/**
 * Importe les decks prêts ou à vérifier d'un collage, en decks publics.
 *
 * Les doublons et les erreurs sont laissés de côté, comme les lignes que
 * l'administrateur a écartées. Chaque deck appartient à `playerId` (celui qui
 * importe) et s'affiche au nom du joueur, ou de « Méta Joutes ».
 */
export async function importMetaDecks(request: MetaImportRequest, playerId: string): Promise<MetaImportResult> {
  const { game, input, source, eventDate, format, skip = [] } = request;
  const rows = await resolveMetaImport(game, input, { source });
  const batchId = new ObjectId().toString();
  const addedAt = new Date();
  const created: MetaImportResult["created"] = [];

  for (const row of rows) {
    if (skip.includes(row.index)) continue;
    if ((row.status !== "ready" && row.status !== "warning") || !row.cards) continue;

    const name = await findAvailableDeckName(playerId, row.name ?? source);
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
      description: [
        `Liste relevée à ${source}`,
        row.placement ? `classée ${row.placement}` : undefined,
        row.pilot ? `jouée par ${row.pilot}` : undefined,
      ]
        .filter(Boolean)
        .join(", ")
        .concat("."),
      cards: row.cards,
      ...(format ? { format } : {}),
      visibility: "public",
      meta,
    });
    created.push({ deckId: deck.id, name: deck.name });
  }

  return { batchId, created, rows };
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

  const infos = await getDeckCardInfos(deck.gameId, deckCardIds(deck.cards));
  const names = new Map(infos.map((info) => [info.id, info.name]));
  const placement = formatPlacement(details.placement);
  const meta: DeckMeta = {
    imported: false,
    source: details.source,
    eventDate: details.eventDate,
    addedBy,
    addedAt: new Date(),
    ...(placement ? { placement } : {}),
    ...(deck.cards ? { contentHash: deckFingerprint(deck.cards, (id) => names.get(id)) } : {}),
  };

  await db.collection(COLLECTION_NAME).updateOne({ _id: new ObjectId(deckId) }, { $set: { meta } });
  return { ok: true, deck: { ...deck, meta } };
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

/** Nombre de decks méta d'un jeu. */
export async function countMetaDecks(gameId: string): Promise<number> {
  return db.collection(COLLECTION_NAME).countDocuments({ gameId, meta: { $exists: true } });
}
