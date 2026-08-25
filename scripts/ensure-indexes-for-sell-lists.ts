/**
 * Index des listes de vente.
 *
 * `createSellListIndexes` existe depuis l'écriture du module mais **aucun
 * script ne l'appelait** : les index n'étaient posés qu'à la main, ou pas du
 * tout. Deux conséquences, l'une déjà là, l'autre nouvelle :
 *
 *  - `getOrCreateSellListForOwner` rattrape une création concurrente sur
 *    l'erreur 11000 de l'unique `(ownerType, ownerId)`. Sans cet index, le
 *    rattrapage ne se déclenche jamais et deux listes peuvent coexister pour
 *    un même propriétaire ;
 *  - le filtre « vend des cartes » du registre interroge désormais
 *    `sellLists` par `{ownerType, ownerId}` puis `sellListItems` par
 *    `{sellListId}`. Sans index, ces deux requêtes sont des parcours complets.
 *
 * Exécutez ce script avec: npx ts-node scripts/ensure-indexes-for-sell-lists.ts
 */

import { createSellListIndexes } from "../lib/db/sell-lists.ts";

async function ensureIndexesForSellLists() {
  console.log("🚀 Début de la migration des index pour les listes de vente...");

  await createSellListIndexes();

  console.log(`✅ Indexes pour les listes de vente créés avec succès`);
}

ensureIndexesForSellLists()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
