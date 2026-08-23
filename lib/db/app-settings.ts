import 'server-only';

import db from "@/lib/mongodb";

const SETTINGS_COLLECTION = 'settings';

/**
 * Les réglages que l'administration change sans redéploiement : un document
 * par clé, une chaîne par document.
 *
 * Volontairement plat. Ce qui se règle ici tient en une chaîne, et une
 * collection typée par réglage coûterait plus qu'elle ne rapporterait — le
 * sens de chaque clé vit auprès de ce qui la lit, pas ici.
 */
export type AppSettingDb = {
  key: string;
  value: string;
  updatedAt?: Date;
  updatedBy?: string;
};

export type AppSetting = {
  value: string;
  updatedAt?: Date;
  updatedBy?: string;
};

/**
 * L'index, créé une fois par instance. Ce dépôt n'a pas de système de
 * migration : cette promesse est ce qui le fait exister. Sans l'unicité, deux
 * enregistrements concurrents du même réglage laisseraient deux documents, et
 * la lecture suivante en choisirait un au hasard.
 *
 * `createIndex` est idempotent. Même motif que `lib/db/wishlists.ts`.
 */
const indexesReady = db
  .collection(SETTINGS_COLLECTION)
  .createIndex({ key: 1 }, { unique: true })
  .catch((error) => {
    console.error("Impossible de créer l'index des réglages:", error);
  });

/** Le réglage complet, pour l'écran qui le donne à relire. */
export async function readAppSetting(key: string): Promise<AppSetting | null> {
  const doc = await db
    .collection<AppSettingDb>(SETTINGS_COLLECTION)
    .findOne({ key }, { projection: { _id: 0, value: 1, updatedAt: 1, updatedBy: 1 } });

  const value = doc?.value?.trim();

  // Une valeur absente ou vide vaut « pas de réglage » : le repli du code
  // reprend la main, plutôt que d'envoyer une chaîne vide au fournisseur.
  if (!value) return null;

  return { value, updatedAt: doc?.updatedAt, updatedBy: doc?.updatedBy ?? undefined };
}

/** La valeur seule, pour le code qui s'en sert. */
export async function readAppSettingValue(key: string): Promise<string | null> {
  return (await readAppSetting(key))?.value ?? null;
}

/**
 * `updatedBy` n'est pas optionnel : un réglage change parce que quelqu'un l'a
 * changé, et un écran qui l'affiche sans dire qui ne sert plus la maintenance.
 */
export async function writeAppSetting(
  key: string,
  value: string,
  updatedBy: string
): Promise<void> {
  await indexesReady;

  await db
    .collection<AppSettingDb>(SETTINGS_COLLECTION)
    .updateOne(
      { key },
      { $set: { value, updatedAt: new Date(), updatedBy } },
      { upsert: true }
    );
}

/** Efface le réglage : la lecture suivante retombe sur le repli du code. */
export async function clearAppSetting(key: string): Promise<void> {
  await db.collection<AppSettingDb>(SETTINGS_COLLECTION).deleteOne({ key });
}
