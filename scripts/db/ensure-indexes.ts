/**
 * Index des directs et des réseaux : les chaînes liées à un compte
 * (`stream_links`), celles des éditeurs suivies depuis la fiche d'un jeu
 * (`game_streams`), et les publications qu'on en rapatrie
 * (`game_social_posts`).
 *
 * Les unicités sont des **règles**, pas des optimisations :
 *
 * - une personne ne lie qu'une chaîne par plateforme — c'est déjà ce que le
 *   compte social autorise, et deux liaisons concurrentes annonceraient deux
 *   directs pour la même personne ;
 * - une chaîne n'appartient qu'à un compte — sinon un même direct s'annoncerait
 *   sur les destinations de deux personnes différentes ;
 * - un jeu ne suit qu'une chaîne par plateforme, parce que sa fiche ne porte
 *   qu'un lien par réseau. C'est aussi la clé sur laquelle le cron horaire
 *   fait son `upsert` : sans elle, deux tours qui se chevauchent créeraient
 *   deux documents pour la même chaîne ;
 * - une publication d'un réseau n'existe qu'une fois par jeu — même raison,
 *   pour le cron biquotidien de `game_social_posts`, dont l'upsert est aussi
 *   ce qui préserve un masquage administrateur d'un tour à l'autre.
 *
 * Sans elles, la fonctionnalité *marche* jusqu'au jour où elle ne marche plus,
 * et la réparation demande alors de trancher entre des documents également
 * plausibles. Voir `docs/STREAM_LINKING.md` et `docs/GAME_LIVES.md`.
 *
 * `createIndex` est idempotent : rejouer ce script ne coûte rien. Il est en
 * revanche **refusé** par MongoDB si des doublons existent déjà — c'est le
 * comportement voulu, et le message d'erreur nomme alors la clé fautive.
 *
 * Exécution :
 *
 *   node --conditions=react-server --import ./scripts/ts-paths-hook.mjs \
 *     scripts/db/ensure-indexes.ts
 *
 * Les deux drapeaux ne sont pas décoratifs. `--conditions=react-server` fait
 * résoudre `server-only` vers son module vide, sans quoi l'import de
 * `lib/mongodb.ts` échoue hors du serveur Next ; `--import` installe la
 * résolution de l'alias `@/` de `tsconfig.json`, que Node ne connaît pas.
 * Le typage, lui, est retiré nativement depuis Node 22.18 — aucun exécuteur
 * TypeScript n'est nécessaire.
 */

import type { IndexSpecification, CreateIndexesOptions } from "mongodb";

import db from "../../lib/mongodb.ts";

type IndexDefinition = {
  collection: string;
  keys: IndexSpecification;
  options?: CreateIndexesOptions;
  /** Ce que l'index sert — lu quand on se demande si on peut le supprimer. */
  why: string;
};

const INDEXES: IndexDefinition[] = [
  {
    collection: "stream_links",
    keys: { userId: 1, platform: 1 },
    options: { unique: true },
    why: "Une liaison par compte et par plateforme ; sert aussi l'écran de compte",
  },
  {
    collection: "stream_links",
    keys: { platform: 1, channelId: 1 },
    options: { unique: true },
    why: "Le chemin des webhooks, qui n'apprennent qu'une plateforme et une chaîne",
  },
  {
    collection: "stream_links",
    keys: { "subscription.expiresAt": 1 },
    why: "Le renouvellement des baux WebSub, qui ne veut que les échéances proches",
  },
  {
    collection: "game_streams",
    keys: { gameId: 1, platform: 1 },
    options: { unique: true },
    why: "Un jeu ne suit qu'une chaîne par plateforme ; c'est aussi la clé de l'upsert du cron",
  },
  {
    collection: "game_streams",
    keys: { live: 1 },
    why: "Les vitrines ne veulent que ce qui diffuse, et le cas courant est qu'il n'y en ait aucun",
  },
  {
    collection: "game_social_posts",
    keys: { gameId: 1, platform: 1, externalId: 1 },
    options: { unique: true },
    why: "Une publication n'existe qu'une fois par jeu ; c'est la clé de l'upsert de la collecte",
  },
  {
    collection: "game_social_posts",
    keys: { gameId: 1, hiddenAt: 1, publishedAt: -1 },
    why: "La lecture des vitrines et le tri de la purge, qui posent la même question",
  },
];

async function ensureIndexes() {
  console.log("🚀 Création des index des directs...");

  for (const { collection, keys, options, why } of INDEXES) {
    const name = await db.collection(collection).createIndex(keys, options ?? {});
    console.log(`  • ${collection}.${name} — ${why}`);
  }

  console.log(`✅ ${INDEXES.length} index en place`);
}

ensureIndexes()
  .then(() => {
    console.log("\n🎉 Migration complétée avec succès");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ La migration a échoué:", error);
    process.exit(1);
  });
