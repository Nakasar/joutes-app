import { DateTime } from "luxon";

/**
 * Les dates venues de plusieurs plateformes, ramenées à une seule forme.
 *
 * ## Pourquoi ce module existe
 *
 * Les publications d'un jeu viennent de sources qui n'écrivent pas leurs dates
 * pareil. Bluesky rend `2026-09-04T18:25:36.591Z` ; le flux Atom de YouTube rend
 * `2026-09-04T18:25:36+00:00`. Les deux sont de l'ISO 8601 valide, et les deux
 * désignent le même instant.
 *
 * Mais `publishedAt` est **le tri de la grille**, et MongoDB trie une chaîne
 * **lexicographiquement** — c'est-à-dire, pour une date ISO, sur l'heure
 * *écrite* et non sur l'instant qu'elle désigne. Tant que tout le monde écrit
 * en UTC, les deux coïncident. Dès qu'un décalage s'en mêle — `+02:00`, ce que
 * rend n'importe quel client européen — ils divergent d'autant :
 *
 *     "2026-09-04T20:00:00+02:00"   (18 h UTC)
 *     "2026-09-04T19:00:00Z"        (19 h UTC, donc plus tard)
 *
 * La comparaison de chaînes range la première **après** la seconde, parce que
 * `20` passe après `19`. Rien ne plante, rien ne se voit dans un test qui ne
 * mêle qu'une source : l'ordre de toute la grille est simplement faux, d'autant
 * d'heures que vaut le décalage.
 *
 * La différence de *forme* entre les deux sources (`+00:00` contre `.591Z`) est
 * plus bénigne — à seconde égale, `+` précède `.` et une forme sans décimales
 * vaut bien `.000`, si bien que l'ordre tombe juste par accident. Elle reste une
 * raison de normaliser : deux chaînes différentes pour un même instant ne se
 * comparent pas comme égales, et rien ne garantit que l'accident dure.
 *
 * D'où la règle : **rien n'entre en base sans passer par ici.** Luxon rend
 * systématiquement un `Z` et trois décimales, donc toutes les valeurs prennent
 * la même longueur et la même forme, et le tri lexicographique redevient
 * chronologique.
 */

/**
 * L'instant, en UTC et sous forme canonique — ou `null` si ce n'en est pas un.
 *
 * `null` plutôt qu'un repli sur « maintenant » : une date illisible est une
 * publication qu'on ne sait pas ranger, et l'écarter vaut mieux que l'épingler
 * en tête de grille par accident.
 */
export function normalizeInstant(value: string | undefined | null): string | null {
  if (!value) {
    return null;
  }

  const parsed = DateTime.fromISO(value, { zone: "utc" });

  return parsed.isValid ? parsed.toUTC().toISO({ suppressMilliseconds: false }) : null;
}

/**
 * Le plus ancien des deux instants, chacun facultatif.
 *
 * Sert une question précise, celle de `publishedAt` chez Bluesky :
 * `record.createdAt` est écrit par l'application qui poste et **n'est vérifié
 * par personne**, tandis qu'`indexedAt` est posé par le serveur. Une
 * publication datée de 2030 — bug de client, horloge décalée, ou malice —
 * s'épinglerait en tête de la grille pour toujours, et la rétention ne
 * l'évincerait jamais puisqu'elle resterait la « plus récente ».
 *
 * Prendre le plus ancien honore une date passée (un import légitime) et ramène
 * une date future au moment où le réseau a réellement vu la publication.
 */
export function earliestInstant(
  a: string | undefined | null,
  b: string | undefined | null,
): string | null {
  const first = normalizeInstant(a);
  const second = normalizeInstant(b);

  if (!first) return second;
  if (!second) return first;

  return first <= second ? first : second;
}
