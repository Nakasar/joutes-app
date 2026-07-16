/**
 * Script de migration pour ajouter le champ `originalLang` (langue du
 * contenu par défaut) aux erratas existants qui n'en ont pas encore.
 * Toutes les erratas existantes ont été rédigées en français.
 *
 * Exécutez ce script avec: npx ts-node scripts/migrate-errata-add-original-lang.ts
 */

import db from "../lib/mongodb";

async function migrateErrataAddOriginalLang() {
  console.log("🚀 Début de la migration des erratas vers originalLang...");

  const erratasCollection = db.collection("erratas");

  const result = await erratasCollection.updateMany(
    { originalLang: { $exists: false } },
    { $set: { originalLang: "fr" } }
  );

  console.log(`✅ ${result.modifiedCount} errata(s) mis à jour avec originalLang="fr"`);
}

migrateErrataAddOriginalLang()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
