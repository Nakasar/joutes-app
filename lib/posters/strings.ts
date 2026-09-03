import { createTranslator } from "next-intl";

import messages from "@/messages/fr.json";

/**
 * Les textes de l'affiche, hors de toute requête.
 *
 * Les pages lisent les leurs avec `getTranslations`, qui tient sa langue du
 * segment `[locale]` de l'URL. Une interaction Discord n'a pas d'URL, pas de
 * segment et pas de langue : le bot parle français, comme toutes ses autres
 * réponses, et l'affiche qu'il poste est celle d'un lieu français, à l'heure
 * de Paris (`POSTER_ZONE`).
 *
 * `createTranslator` est synchrone et se contente des messages qu'on lui
 * donne : c'est ce qui permet de composer une affiche depuis un endroit où
 * `getTranslations` n'aurait pas de contexte à lire.
 */

/** La langue du bot, et celle des affiches qu'il poste. */
export const POSTER_BOT_LOCALE = "fr";

/** La signature que l'affiche attend : `Lairs.poster.*`, valeurs comprises. */
export type PosterTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Les textes de `Lairs.poster`, prêts à passer à l'affiche.
 *
 * Le transtypage dit une chose et une seule : l'affiche compose ses clés
 * (`styles.${style}.cta`), là où `createTranslator` les type sur le fichier de
 * messages. Une clé absente se voit au rendu, comme partout ailleurs dans le
 * dépôt — les pages passent le même `t` élargi à `Poster`.
 */
export function posterStrings(): PosterTranslate {
  return createTranslator({
    locale: POSTER_BOT_LOCALE,
    messages,
    namespace: "Lairs.poster",
  }) as unknown as PosterTranslate;
}

/** Les libellés de l'en-tête quand l'affiche réunit plusieurs lieux. */
export function posterVenueStrings(t: PosterTranslate) {
  return {
    venues: (count: number) => t("venues", { count }),
    more: (count: number) => t("more", { count }),
  };
}
