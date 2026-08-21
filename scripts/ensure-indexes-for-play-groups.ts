/**
 * Index des groupes de jeu : rôle d'armes, sessions et abonnés de la vitrine.
 *
 * Exécutez ce script avec: npx ts-node scripts/ensure-indexes-for-play-groups.ts
 */

import db from "../lib/mongodb.ts";
import { createPlayGroupSessionIndexes } from "../lib/db/play-group-sessions.ts";

async function ensureIndexesForPlayGroups() {
  console.log("🚀 Début de la migration des index pour les groupes de jeu...");

  await createPlayGroupSessionIndexes();
  await db.collection("playGroupFollowers").createIndex({ playGroupId: 1, userId: 1 }, { unique: true });
  await db.collection("playGroupFollowers").createIndex({ userId: 1 });

  // Le rôle d'armes interroge `{ $or: [visibilité, appartenance] }` puis trie
  // par `updatedAt` décroissant. Les deux branches portent donc la date : un
  // index sur le seul critère d'égalité servirait la recherche mais laisserait
  // le tri se faire en mémoire.
  await db.collection("playGroups").createIndex({ visibility: 1, updatedAt: -1 });
  await db.collection("playGroups").createIndex({ "members.userId": 1, updatedAt: -1 });

  console.log(`✅ Indexes pour les groupes de jeu créés avec succès`);
}

ensureIndexesForPlayGroups()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
