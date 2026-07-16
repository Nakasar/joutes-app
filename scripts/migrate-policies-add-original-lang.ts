/**
 * Script de migration pour ajouter le champ `originalLang` (langue du
 * contenu par défaut) aux policies existantes qui n'en ont pas encore.
 * Toutes les policies existantes ont été rédigées en français.
 *
 * Exécutez ce script avec: npx ts-node scripts/migrate-policies-add-original-lang.ts
 */

import db from "../lib/mongodb";

async function migratePoliciesAddOriginalLang() {
  console.log("🚀 Début de la migration des policies vers originalLang...");

  const policiesCollection = db.collection("policies");

  const result = await policiesCollection.updateMany(
    { originalLang: { $exists: false } },
    { $set: { originalLang: "fr" } }
  );

  console.log(`✅ ${result.modifiedCount} policy(ies) mise(s) à jour avec originalLang="fr"`);
}

migratePoliciesAddOriginalLang()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
