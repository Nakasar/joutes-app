/**
 * Rattachement des prix à un flux de cartes, par paquets.
 *
 * L'export d'un jeu ne rassemble jamais ses cartes : elles arrivent d'un
 * curseur et repartent aussitôt vers le stockage (cf. docs/GAME_EXPORTS.md).
 * Leur coller un prix ne doit donc ni charger le catalogue d'un bloc, ni
 * interroger la base une fois par carte : les cartes sont accumulées jusqu'à
 * `batchSize`, le lot reçoit ses prix en une requête, puis repart carte par
 * carte.
 *
 * Module pur, sans base : c'est le découpage, pas la lecture des prix. Un
 * paquet oublié — le dernier, le plus souvent — ferait disparaître des cartes
 * du document, et cela ne se verrait qu'au téléchargement, chez tous les
 * clients hors ligne à la fois. D'où les tests.
 */

/**
 * Reprend `cards` en y appliquant `attach` par paquets de `batchSize`.
 *
 * L'ordre des cartes est celui du flux d'entrée, et `attach` reçoit toujours
 * un lot non vide.
 */
export async function* attachInBatches<T, R>(
  cards: AsyncIterable<T>,
  attach: (batch: T[]) => Promise<R[]>,
  batchSize: number
): AsyncGenerator<R> {
  if (batchSize < 1) {
    throw new Error("attachInBatches: batchSize doit valoir au moins 1.");
  }

  let batch: T[] = [];

  for await (const card of cards) {
    batch.push(card);

    if (batch.length >= batchSize) {
      yield* await attach(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    yield* await attach(batch);
  }
}
