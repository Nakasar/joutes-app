/**
 * Script de migration pour convertir le champ `cardId` (string) des erratas
 * vers le nouveau champ `cardIds` (string[]), permettant de lier un errata
 * à plusieurs cartes.
 *
 * Exécutez ce script avec: npx ts-node scripts/migrate-errata-cardid-to-cardids.ts
 */

import db from "../lib/mongodb";

async function migrateErrataCardIdToCardIds() {
  console.log("🚀 Début de la migration des erratas vers cardIds...");

  const erratasCollection = db.collection("erratas");

  const erratasWithOldFormat = await erratasCollection.find({
    cardId: { $exists: true },
    cardIds: { $exists: false },
  }).toArray();

  console.log(`📍 ${erratasWithOldFormat.length} errata(s) trouvé(s) avec l'ancien format cardId`);

  if (erratasWithOldFormat.length === 0) {
    console.log("✅ Aucune migration nécessaire");
    return;
  }

  let migratedCount = 0;

  for (const errata of erratasWithOldFormat) {
    await erratasCollection.updateOne(
      { _id: errata._id },
      {
        $set: { cardIds: [errata.cardId] },
        $unset: { cardId: "" },
      }
    );

    migratedCount++;
    console.log(`✓ Migré: errata ${errata._id.toString()} (carte ${errata.cardId})`);
  }

  console.log(`\n✅ Migration terminée: ${migratedCount} errata(s) migré(s)`);
}

migrateErrataCardIdToCardIds()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
