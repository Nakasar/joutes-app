/**
 * Script de migration pour ajouter les index requis pour les notifications.
 * Cela permet d'améliorer les performances des requêtes liées aux notifications.
 *
 * Exécutez ce script avec: npx ts-node scripts/ensure-indexes-for-notifications.ts
 */

import db from "../lib/mongodb.ts";

async function ensureIndexesForNotifications() {
  console.log("🚀 Début de la migration des index pour les notifications...");

  await db.collection('push_devices').createIndex({ token: 1 }, { unique: true });
  await db.collection('push_devices').createIndex({ userId: 1, state: 1 });
  await db.collection('push_devices').createIndex({ installationId: 1, userId: 1 });
  await db.collection('user').createIndex({ lairs: 1 });

  console.log(`✅ Indexes pour les notifications créés avec succès`);
}

ensureIndexesForNotifications()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
