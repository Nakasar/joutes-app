/**
 * Index des listes de vente.
 *
 * Ils étaient déclarés dans `lib/db/sell-lists.ts` depuis l'écriture du module,
 * et **aucun script ne les posait** : en pratique ils n'existaient qu'à la main,
 * ou pas du tout. Deux conséquences, l'une déjà là, l'autre nouvelle :
 *
 * - `getOrCreateSellListForOwner` rattrape une création concurrente sur
 *   l'erreur 11000 de l'unique `(ownerType, ownerId)`. Sans cet index, le
 *   rattrapage ne se déclenche jamais et deux listes peuvent coexister pour un
 *   même propriétaire ;
 * - le filtre « vend des cartes » du registre interroge désormais `sellLists`
 *   par `{ownerType, ownerId}` puis `sellListItems` par `{sellListId}`. Sans
 *   index, ces deux requêtes sont des parcours complets.
 *
 * `createIndex` est idempotent : rejouer ce script ne coûte rien. Il est en
 * revanche **refusé** par MongoDB si des doublons existent déjà — c'est le
 * comportement voulu, et le message d'erreur nomme alors la clé fautive.
 *
 * Exécution :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/ensure-indexes-for-sell-lists.ts
 *
 * Les deux drapeaux ne sont pas décoratifs, et c'est aussi pourquoi les
 * définitions sont ici plutôt que tirées de `lib/db/sell-lists.ts` :
 * `--conditions=react-server` fait résoudre `server-only` vers son module vide,
 * `--import` installe l'alias `@/` que Node ne connaît pas — mais importer le
 * module de la couche db entraînerait tout son graphe (groupes de jeu,
 * utilisateurs, liaisons de direct), dont une partie ne se charge pas hors du
 * bundler. Le script ne prend donc que `lib/mongodb.ts`, comme
 * `scripts/db/ensure-indexes.ts`, qui est la source unique des index de
 * `stream_links` pour la même raison.
 */

import type { IndexSpecification, CreateIndexesOptions } from "mongodb";

import db from "../lib/mongodb.ts";

type IndexDefinition = {
  collection: string;
  keys: IndexSpecification;
  options?: CreateIndexesOptions;
  /** Ce que l'index sert — lu quand on se demande si on peut le supprimer. */
  why: string;
};

const INDEXES: IndexDefinition[] = [
  {
    collection: "sellLists",
    keys: { ownerType: 1, ownerId: 1 },
    options: { unique: true },
    why: "Une liste par propriétaire ; sert la lecture d'une liste et le filtre « vend » du registre",
  },
  {
    collection: "sellListItems",
    keys: { collectionEntryId: 1 },
    options: { unique: true },
    why: "Un exemplaire de collection ne se met en vente qu'une fois ; sert aussi les retraits en cascade",
  },
  {
    collection: "sellListItems",
    keys: { sellListId: 1 },
    why: "Le contenu d'une liste, et le « a-t-elle au moins un article » du registre",
  },
  {
    collection: "sellListItems",
    keys: { sellListId: 1, gameId: 1 },
    why: "Le contenu d'une liste restreint à un jeu",
  },
];

async function ensureIndexesForSellLists() {
  console.log("🚀 Création des index des listes de vente...");

  for (const index of INDEXES) {
    const name = await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
    console.log(`  ✔ ${index.collection} — ${name} (${index.why})`);
  }

  console.log(`✅ ${INDEXES.length} index des listes de vente en place`);
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
