/**
 * Recalcule les domaines enregistrés de tous les decks : `npm run decks:domains`.
 *
 * Jusqu'au 2026-11-09, les domaines d'un deck réunissaient ceux de toutes ses
 * cartes, champs de bataille (« Colorless ») et réserve compris : un deck
 * Fury/Order affichait aussi Colorless et Body. La règle est maintenant celle
 * de `lib/decks/domains.ts` : les domaines de la légende, sinon ceux des
 * cartes jouées, sans « Colorless ».
 *
 *   npm run decks:domains -- --dry-run   compte ce qui changerait, sans rien écrire
 *
 * Idempotent : un deck déjà juste n'est pas réécrit. La base visée est celle de
 * `MONGODB_URI`, lue dans l'environnement ou dans `.env.local` / `.env`.
 */

import { ObjectId } from "mongodb";

import db from "../../lib/mongodb.ts";
import { computeDeckDomains } from "../../lib/decks/domains.ts";
import { deckCardIds, type DeckCards } from "../../lib/decks/contents.ts";

const dryRun = process.argv.includes("--dry-run");

type DeckDoc = { _id: unknown; gameId: string; legendCardId?: string; domains?: string[]; cards?: DeckCards };

/**
 * Même calcul que `deriveDeckDomains` (lib/db/deck-cards.ts), relu ici
 * directement dans la collection `cards` : ce module-là tire des imports de
 * Next qui ne se chargent pas hors du serveur.
 */
async function deckDomains(deck: DeckDoc): Promise<string[]> {
  const ids = [...new Set([...deckCardIds(deck.cards), ...(deck.legendCardId ? [deck.legendCardId] : [])])];
  if (ids.length === 0 || !ObjectId.isValid(deck.gameId)) return deck.domains ?? [];
  const docs = await db
    .collection<{ id: string; domain?: string[] }>("cards")
    .find({ gameId: new ObjectId(deck.gameId), id: { $in: ids } }, { projection: { _id: 0, id: 1, domain: 1 } })
    .toArray();
  const byId = new Map<string, string[] | undefined>();
  for (const doc of docs) if (!byId.has(doc.id)) byId.set(doc.id, doc.domain);
  return computeDeckDomains(deck.cards, (cardId) => byId.get(cardId), deck.legendCardId);
}

async function main() {
  const decks = db.collection<DeckDoc>("decks");
  const cursor = decks.find({ cards: { $exists: true } }, { projection: { gameId: 1, legendCardId: 1, domains: 1, cards: 1 } });

  let seen = 0;
  let changed = 0;
  for await (const deck of cursor) {
    seen += 1;
    const domains = await deckDomains(deck);
    const before = (deck.domains ?? []).join("|");
    if (before === domains.join("|")) continue;
    changed += 1;
    if (changed <= 20) console.log(`${String(deck._id)} : ${before || "—"} → ${domains.join("|") || "—"}`);
    if (!dryRun) await decks.updateOne({ _id: deck._id }, { $set: { domains } });
  }

  console.log(`${seen} deck(s) lus, ${changed} ${dryRun ? "à corriger (rien écrit)" : "corrigé(s)"}.`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
