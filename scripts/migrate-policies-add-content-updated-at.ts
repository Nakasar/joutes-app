/**
 * Script de migration pour ajouter le champ `contentUpdatedAt` (date de
 * dernière mise à jour du contenu original) aux policies existantes, ainsi
 * que le champ `updatedAt` à leurs traductions existantes. Pour les
 * documents déjà existants, on utilise `createdAt` comme valeur de départ.
 *
 * Exécutez ce script avec: npx ts-node scripts/migrate-policies-add-content-updated-at.ts
 */

import db from "../lib/mongodb";

async function migratePoliciesAddContentUpdatedAt() {
  console.log("🚀 Début de la migration des policies vers contentUpdatedAt...");

  const policiesCollection = db.collection("policies");

  const contentResult = await policiesCollection.updateMany(
    { contentUpdatedAt: { $exists: false } },
    [{ $set: { contentUpdatedAt: "$createdAt" } }]
  );

  console.log(`✅ ${contentResult.modifiedCount} policy(ies) mise(s) à jour avec contentUpdatedAt=createdAt`);

  const translationsResult = await policiesCollection.updateMany(
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

  console.log(`✅ ${translationsResult.modifiedCount} policy(ies) mise(s) à jour avec translations[].updatedAt`);
}

migratePoliciesAddContentUpdatedAt()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
