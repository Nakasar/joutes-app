import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attachInBatches } from "@/lib/prices/stream";

/**
 * Tests du découpage en paquets. Il sert à coller leur prix aux cartes de
 * l'export sans jamais rassembler le catalogue : une carte perdue au passage
 * disparaîtrait du document hors ligne sans que rien ne le signale.
 *
 * Exécution : `npm run test`.
 */

async function* asAsync<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item;
}

async function collect<T>(cards: AsyncIterable<T>): Promise<T[]> {
  const all: T[] = [];
  for await (const card of cards) all.push(card);
  return all;
}

/** Marque chaque carte du lot, et retient les lots reçus. */
function marker() {
  const batches: string[][] = [];
  const attach = async (batch: string[]) => {
    batches.push([...batch]);
    return batch.map((card) => `${card}!`);
  };
  return { batches, attach };
}

describe("attachInBatches", () => {
  it("rend toutes les cartes, dans l'ordre", async () => {
    const { attach } = marker();
    const cards = Array.from({ length: 7 }, (_, index) => `c${index}`);

    const result = await collect(attachInBatches(asAsync(cards), attach, 3));

    assert.deepEqual(result, cards.map((card) => `${card}!`));
  });

  it("écoule le dernier paquet, même incomplet", async () => {
    const { batches, attach } = marker();

    await collect(attachInBatches(asAsync(["a", "b", "c", "d", "e"]), attach, 2));

    assert.deepEqual(batches, [["a", "b"], ["c", "d"], ["e"]]);
  });

  it("ne coupe pas un paquet plein en deux", async () => {
    const { batches, attach } = marker();

    await collect(attachInBatches(asAsync(["a", "b", "c", "d"]), attach, 2));

    assert.deepEqual(batches, [["a", "b"], ["c", "d"]]);
  });

  it("n'appelle pas la lecture des prix sur un flux vide", async () => {
    // Une requête par paquet, et pas de paquet vide : un jeu sans carte ne
    // doit pas interroger la base pour rien.
    const { batches, attach } = marker();

    const result = await collect(attachInBatches(asAsync([]), attach, 10));

    assert.deepEqual(result, []);
    assert.deepEqual(batches, []);
  });

  it("refuse un paquet de taille nulle", async () => {
    const { attach } = marker();

    await assert.rejects(() => collect(attachInBatches(asAsync(["a"]), attach, 0)));
  });
});
