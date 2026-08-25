/**
 * La mécanique de version d'un enregistrement de deck : ce que l'écriture
 * exige de trouver, et ce qu'elle pose.
 *
 * Extrait de `updateDeck` pour être **testable sans base**. Ces quelques lignes
 * portent deux cas limites qui ne se voient pas à la lecture, et le second a
 * déjà produit un défaut :
 *
 *  - un deck écrit avant l'introduction de `version` n'a pas le champ, et
 *    `toDeck` le rend comme valant 1 : la garde doit donc accepter l'absence
 *    quand le client annonce attendre cette première version ;
 *  - `$inc` sur un champ absent le pose à **1**, pas à 2. Le deck resterait
 *    donc à 1 après son premier enregistrement, et deux écritures concurrentes
 *    tenant toutes deux « 1 » passeraient l'une après l'autre sans que la garde
 *    ne morde — précisément sur les decks les plus anciens.
 */

/** Ce que `toDeck` rend pour un deck écrit avant l'introduction du champ. */
export const FIRST_DECK_VERSION = 1;

export type DeckVersionWrite = {
  /** À fondre dans le filtre du `findOneAndUpdate`. Vide sans version attendue. */
  guard: Record<string, unknown>;
  /** `$inc` à appliquer, quand le champ existe déjà. */
  inc?: number;
  /** `$set` à appliquer, quand le champ manque — les deux s'excluent. */
  set?: number;
};

/**
 * @param currentVersion la valeur lue sur le document, telle quelle — le champ
 *   peut manquer, valoir autre chose qu'un nombre, ou être là.
 * @param expectedVersion ce que le client annonce avoir vu. Absent, l'écriture
 *   n'est pas gardée : c'est le « dernier gagne » d'avant.
 */
export function deckVersionWrite(
  currentVersion: unknown,
  expectedVersion?: number,
): DeckVersionWrite {
  const guard =
    expectedVersion === undefined
      ? {}
      : expectedVersion === FIRST_DECK_VERSION
        ? // Le champ absent *est* la première version : la garde doit accepter
          // les deux formes, sans quoi aucun deck ancien ne serait modifiable.
          { $or: [{ version: FIRST_DECK_VERSION }, { version: { $exists: false } }] }
        : { version: expectedVersion };

  /*
   * `$set` et `$inc` ne peuvent pas viser le même champ dans une même écriture :
   * l'un des deux porte `version`, jamais les deux.
   *
   * `Number.isInteger` et non `typeof === "number"` : `typeof NaN` vaut
   * « number ». Une version corrompue partirait alors en `$inc`, resterait
   * `NaN` — et comme `NaN` n'égale rien, pas même lui-même, aucune garde ne la
   * retrouverait jamais. Le deck deviendrait définitivement inenregistrable
   * pour tout client qui en pose une. La traiter comme absente le remet à flot.
   */
  return Number.isInteger(currentVersion)
    ? { guard, inc: 1 }
    : { guard, set: FIRST_DECK_VERSION + 1 };
}
