/**
 * Écrit les résultats de tous les tournois Joutes terminés : `npm run results:backfill`.
 *
 * Depuis le 2026-11-10, un tournoi écrit les résultats de ses joueurs à sa
 * clôture (`lib/tournaments/sync-results.ts`) ; les tournois terminés avant
 * n'en ont pas. Ce script les rattrape.
 *
 *   npm run results:backfill -- --dry-run   compte ce qui serait écrit, sans rien écrire
 *
 * Idempotent : relancer réécrit classements et bilans, et garde le deck lié et
 * la visibilité choisis par chaque joueur. La base visée est celle de
 * `MONGODB_URI`, lue dans l'environnement ou dans `.env.local` / `.env`.
 */

import type { ObjectId } from "mongodb";

import db from "../../lib/mongodb.ts";
import { readJoutesTournamentResults, syncJoutesTournamentResults } from "../../lib/tournaments/sync-results.ts";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const cursor = db
    .collection<{ _id: ObjectId; name: string }>("tournaments")
    .find({ status: "completed", gameId: { $exists: true, $nin: [null, ""] } }, { projection: { name: 1 } });

  let tournaments = 0;
  let results = 0;
  for await (const tournament of cursor) {
    const id = tournament._id.toString();
    const outcome = dryRun ? await readJoutesTournamentResults(id) : await syncJoutesTournamentResults(id);
    if (outcome.status === "skipped") continue;
    tournaments += 1;
    results += outcome.drafts.length;
    if (tournaments <= 20) console.log(`${id} « ${tournament.name} » : ${outcome.drafts.length} joueur(s) avec compte`);
  }

  console.log(
    `${tournaments} tournoi(s) terminé(s), ${results} résultat(s) ${dryRun ? "à écrire (rien écrit)" : "écrit(s)"}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
