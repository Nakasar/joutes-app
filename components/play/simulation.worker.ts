/// <reference lib="webworker" />

import init, { simulate } from "@/lib/engine/pkg/joutes.js";

/**
 * Les parties simulées tournent ici, hors de la page : une partie prend
 * jusqu'à une seconde de calcul, que la page ne doit pas sentir.
 *
 * Message reçu : `{ id, config, seed, bots }`. Rendu : `{ id, summary }` (le
 * `GameSummary` du moteur) ou `{ id, error }`.
 */
type Job = { id: number; config: unknown; seed: number; bots: string[] };

let ready: Promise<unknown> | undefined;

self.onmessage = async (message: MessageEvent<Job>) => {
  const { id, config, seed, bots } = message.data;
  try {
    ready ??= init();
    await ready;
    const summary = JSON.parse(simulate(JSON.stringify(config), seed, JSON.stringify(bots))) as unknown;
    self.postMessage({ id, summary });
  } catch (error) {
    // Un échec de chargement ne condamne pas le worker : la prochaine partie réessaie.
    ready = undefined;
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
