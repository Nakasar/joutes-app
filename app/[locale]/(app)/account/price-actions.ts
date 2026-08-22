"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth.ts";
import { getUserById, updateUserPricePreference } from "@/lib/db/users.ts";
import {
  CARD_PRICE_SOURCES,
  type CardPricePreference,
  type CardPriceSource,
} from "@/lib/types/card-price.ts";

/**
 * Le fournisseur de prix qu'un joueur s'est choisi, enregistré.
 *
 * Deux écrans y mènent — la section « Prix des cartes » du compte, et le
 * bouton « Utiliser » sur la fiche d'une carte —, et c'est le même réglage :
 * un prix doit se lire pareil d'un écran à l'autre, il ne peut donc pas y en
 * avoir un par écran.
 */

/**
 * Change la source, en gardant le repli tel qu'il est.
 *
 * C'est le geste de la fiche d'une carte : « celui-là, plutôt ». Le repli est
 * un réglage à part, qui se change dans le compte — le changer ici à l'insu du
 * joueur ferait apparaître ou disparaître des prix qu'il n'a pas demandés.
 */
export async function usePriceSourceAction(
  source: CardPriceSource
): Promise<{ success: boolean; error?: string }> {
  const userId = await currentUserId();

  if (!userId) {
    return { success: false, error: "Non authentifié" };
  }

  // L'argument vient du navigateur : un fournisseur inconnu est refusé plutôt
  // qu'enregistré, sans quoi la préférence nommerait quelque chose qui
  // n'existe pas.
  if (!CARD_PRICE_SOURCES.includes(source)) {
    return { success: false, error: "Fournisseur inconnu" };
  }

  const current = (await getUserById(userId))?.pricePreference;

  return save(userId, { source, fallback: current?.fallback !== false });
}

/** Le réglage entier, tel que la page du compte le pose. */
export async function updatePricePreferenceAction(
  preference: CardPricePreference
): Promise<{ success: boolean; error?: string }> {
  const userId = await currentUserId();

  if (!userId) {
    return { success: false, error: "Non authentifié" };
  }

  const source = preference.source;

  if (source !== undefined && !CARD_PRICE_SOURCES.includes(source)) {
    return { success: false, error: "Fournisseur inconnu" };
  }

  return save(userId, { source, fallback: preference.fallback !== false });
}

async function currentUserId(): Promise<string | undefined> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id;
}

async function save(
  userId: string,
  preference: CardPricePreference
): Promise<{ success: boolean; error?: string }> {
  try {
    await updateUserPricePreference(userId, preference);
    return { success: true };
  } catch (error) {
    console.error("Enregistrement de la préférence de prix impossible :", error);
    return { success: false, error: "Erreur serveur" };
  }
}
