/**
 * Applique les corrections de type et de domaine de Radiance à la base et à
 * l'index de recherche : `npm run cards:riftbound-corrections`.
 *
 * La liste est dans `lib/cards/riftbound-corrections.ts` ; l'import des cartes
 * l'applique aussi, pour qu'un nouvel import n'efface pas ce travail.
 *
 *   npm run cards:riftbound-corrections -- --dry-run   liste ce qui changerait, sans rien écrire
 *
 * Idempotent : une carte déjà juste n'est pas réécrite. La base visée est celle
 * de `MONGODB_URI` ; l'index, celui de `MEILISEARCH_ENDPOINT`, lus dans
 * l'environnement ou dans `.env.local` / `.env`. Seuls `type`, `types` et
 * `domain` sont touchés (mise à jour partielle de l'index : variantes et
 * traductions restent en place).
 */

import { ObjectId } from "mongodb";

import db from "../../lib/mongodb.ts";
import meilisearch, { indexes } from "../../lib/meilisearch.ts";
import { searchDocumentId } from "../../lib/cards/import-search.ts";
import { RIFTBOUND_CORRECTIONS, riftboundCorrectionFields } from "../../lib/cards/riftbound-corrections.ts";

const dryRun = process.argv.includes("--dry-run");

const RIFTBOUND_GAME_ID = new ObjectId("69009afea722eab4fa0e55c4");

type CardDoc = { id: string; type?: string; types?: string[]; domain?: string[] };

const show = (card: CardDoc) => `${card.type ?? "—"} / ${(card.domain ?? []).join("+") || "—"}`;

async function main() {
  const cards = db.collection<CardDoc>("cards");
  const ids = Object.keys(RIFTBOUND_CORRECTIONS);
  const stored = await cards
    .find({ gameId: RIFTBOUND_GAME_ID, id: { $in: ids } }, { projection: { _id: 0, id: 1, type: 1, types: 1, domain: 1 } })
    .toArray();
  const byId = new Map(stored.map((card) => [card.id, card]));

  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length > 0) console.warn(`Absentes de la base (ignorées) : ${missing.join(", ")}`);

  const toIndex: (CardDoc & { id: string })[] = [];
  let changed = 0;
  for (const card of stored) {
    const fields = riftboundCorrectionFields(card.id);
    if (!fields) continue;
    const after = { ...card, ...fields };
    const same = card.type === after.type && card.domain?.join("|") === after.domain?.join("|") && card.types?.join("|") === after.types?.join("|");
    if (same) continue;
    changed += 1;
    console.log(`${card.id} : ${show(card)} → ${show(after)}`);
    if (!dryRun) await cards.updateOne({ gameId: RIFTBOUND_GAME_ID, id: card.id }, { $set: fields });
  }

  // L'index est resynchronisé pour toutes les cartes corrigées, même si la base
  // était déjà juste : c'est ce qui rattrape un envoi interrompu.
  for (const card of stored) {
    const fields = riftboundCorrectionFields(card.id);
    if (fields) toIndex.push({ id: searchDocumentId(card.id), ...fields });
  }
  if (!dryRun && toIndex.length > 0) {
    const task = await meilisearch.index(indexes.riftbound.name).updateDocuments(toIndex);
    console.log(`Index « ${indexes.riftbound.name} » : ${toIndex.length} document(s) mis à jour (tâche ${task.taskUid}).`);
  }

  console.log(`${stored.length} carte(s) lue(s), ${changed} ${dryRun ? "à corriger en base (rien écrit)" : "corrigée(s) en base"}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
