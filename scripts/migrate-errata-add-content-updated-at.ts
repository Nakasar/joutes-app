/**
 * Script de migration pour ajouter le champ `contentUpdatedAt` (date de
 * dernière mise à jour du contenu original) aux erratas existants, ainsi
 * que le champ `updatedAt` à leurs traductions existantes. Pour les
 * documents déjà existants, on utilise `createdAt` comme valeur de départ.
 *
 * Exécutez ce script avec: npx ts-node scripts/migrate-errata-add-content-updated-at.ts
 */

import db from "../lib/mongodb";

async function migrateErrataAddContentUpdatedAt() {
  console.log("🚀 Début de la migration des erratas vers contentUpdatedAt...");

  const erratasCollection = db.collection("erratas");

  const contentResult = await erratasCollection.updateMany(
    { contentUpdatedAt: { $exists: false } },
    [{ $set: { contentUpdatedAt: "$createdAt" } }]
  );

  console.log(`✅ ${contentResult.modifiedCount} errata(s) mis à jour avec contentUpdatedAt=createdAt`);

  const translationsResult = await erratasCollection.updateMany(
    { translations: { $type: "array", $ne: [] } },
    [
      {
        $set: {
          translations: {
            $map: {
              input: "$translations",
              as: "tr",
              in: { $mergeObjects: ["$$tr", { updatedAt: { $ifNull: ["$$tr.updatedAt", "$createdAt"] } }] },
            },
          },
        },
      },
    ]
  );

  console.log(`✅ ${translationsResult.modifiedCount} errata(s) mis à jour avec translations[].updatedAt`);
}

migrateErrataAddContentUpdatedAt()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
