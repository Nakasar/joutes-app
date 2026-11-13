/// <reference lib="webworker" />

import init, { swu_simulate } from "@/lib/engine/swu/pkg/joutes_swu.js";

/**
 * Les parties simulées de Star Wars: Unlimited tournent ici, hors de la page,
 * comme celles de Riftbound (`simulation.worker.ts`).
 *
 * Message reçu : `{ id, config, seed, bots }`. Rendu : `{ id, summary }` (le
 * `GameSummary` du moteur, où le score est ce qu'il reste de PV à chaque base)
 * ou `{ id, error }`.
 */
type Job = { id: number; config: unknown; seed: number; bots: string[] };

let ready: Promise<unknown> | undefined;

self.onmessage = async (message: MessageEvent<Job>) => {
  const { id, config, seed, bots } = message.data;
  try {
    ready ??= init();
    await ready;
    const summary = JSON.parse(swu_simulate(JSON.stringify(config), seed, JSON.stringify(bots))) as unknown;
    self.postMessage({ id, summary });
  } catch (error) {
    // Un échec de chargement ne condamne pas le worker : la prochaine partie réessaie.
    ready = undefined;
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
