/**
 * Index des collections de produits.
 *
 * L'unicité de `{gameId, id}` est le point important, et elle doit exister
 * **avant** le moindre import : `cards.id` n'est pas unique, ce qui oblige
 * toutes les agrégations de collection à un `$arrayElemAt` défensif. On ne
 * reproduit pas ce défaut ici.
 *
 * Script idempotent : `createIndex` ne fait rien si l'index existe déjà.
 *
 * Exécutez ce script avec: npx tsx scripts/create-product-indexes.ts
 */

import db from "../lib/mongodb";

async function createProductIndexes() {
  console.log("🚀 Création des index des produits...");

  const products = db.collection("products");
  await products.createIndex({ gameId: 1, id: 1 }, { unique: true, name: "gameId_id_unique" });
  await products.createIndex({ gameId: 1, setCode: 1 }, { name: "gameId_setCode" });
  await products.createIndex({ gameId: 1, kind: 1 }, { name: "gameId_kind" });
  await products.createIndex({ gameId: 1, name: 1 }, { name: "gameId_name" });
  // « Présent dans » : les boîtes dont le contenu cite une figurine.
  await products.createIndex({ gameId: 1, "contents.productId": 1 }, { name: "gameId_contents" });
  console.log("✅ products");

  const entries = db.collection("collection-products");
  await entries.createIndex({ userId: 1, gameId: 1 }, { name: "userId_gameId" });
  await entries.createIndex({ playGroupId: 1, gameId: 1 }, { name: "playGroupId_gameId" });
  await entries.createIndex({ userId: 1, productId: 1 }, { name: "userId_productId" });
  // Retrait d'un conteneur : on efface d'un coup ce qu'il a apporté.
  await entries.createIndex({ fromProductEntryId: 1 }, { name: "fromProductEntryId" });
  console.log("✅ collection-products");
}

createProductIndexes()
  .then(() => {
    console.log("\n🎉 Index créés");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La création des index a échoué:", error);
    process.exit(1);
  });
