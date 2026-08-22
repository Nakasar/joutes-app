/**
 * Index des vitrines de profil : abonnés, publications, et le registre.
 *
 * Exécutez ce script avec: npx ts-node scripts/ensure-indexes-for-user-profiles.ts
 */

import db from "../lib/mongodb.ts";
import { createUserFollowerIndexes } from "../lib/db/user-followers.ts";
import { createUserContentIndexes } from "../lib/db/user-contents.ts";

async function ensureIndexesForUserProfiles() {
  console.log("🚀 Début de la migration des index pour les vitrines de profil...");

  await createUserFollowerIndexes();
  await createUserContentIndexes();

  // Le registre ne cherche que parmi les profils publics, et trie par date de
  // création ou par pseudonyme. Les deux index portent donc le tri à côté du
  // critère d'égalité : sans lui, chaque page de vingt fiches se paierait un
  // tri en mémoire sur toute la collection.
  await db.collection("user").createIndex({ isPublicProfile: 1, createdAt: -1 });
  await db.collection("user").createIndex({ isPublicProfile: 1, displayName: 1 });

  // Les deux filtres de pastille : le jeu suivi, et la commune — celle-ci
  // n'étant interrogeable que sur les comptes qui l'ont rendue visible.
  await db.collection("user").createIndex({ isPublicProfile: 1, games: 1 });
  await db
    .collection("user")
    .createIndex({ isPublicProfile: 1, "showcase.showCity": 1, "location.city": 1 });

  console.log(`✅ Indexes pour les vitrines de profil créés avec succès`);
}

ensureIndexesForUserProfiles()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
