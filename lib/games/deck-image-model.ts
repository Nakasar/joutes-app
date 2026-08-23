import 'server-only';

import { readAppSettingValue } from "@/lib/db/app-settings";

/** La clé du réglage, dans la collection `settings`. */
export const DECK_IMAGE_MODEL_SETTING_KEY = 'deck-image-analysis-model';

/**
 * Le modèle utilisé tant qu'aucun réglage n'a été enregistré. Il reste dans le
 * code : un déploiement neuf doit lire les photos sans qu'on ait d'abord
 * ouvert l'administration.
 */
export const DECK_IMAGE_MODEL_DEFAULT = 'gpt-5.6-luna';

/**
 * Relu à chaque analyse, sans mémoire : un changement dans l'administration
 * prend effet sur la lecture suivante, et une requête Mongo ne pèse rien
 * devant l'appel au modèle qui suit.
 */
export async function readDeckImageModel(): Promise<string> {
  return (await readAppSettingValue(DECK_IMAGE_MODEL_SETTING_KEY)) ?? DECK_IMAGE_MODEL_DEFAULT;
}
