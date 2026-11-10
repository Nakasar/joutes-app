import "server-only";

import {
  auto_deck,
  catalog,
  initSync,
  judge_review,
  judge_simulate,
  validate_deck,
  version,
} from "@/lib/engine/pkg/joutes.js";
import { ENGINE_WASM_BASE64 } from "@/lib/engine/wasm.generated";
import type { EngineCard, EngineDeckList, EngineRecord, JudgeReport } from "@/lib/engine/types";

/**
 * Le moteur de jeu côté serveur : valider un deck, arbitrer une situation.
 *
 * Le binaire est instancié une fois par processus, au premier appel. Les
 * parties elles-mêmes ne tournent pas ici : contre l'IA elles tournent dans le
 * navigateur, en ligne sur le serveur de parties.
 */
let ready = false;

function engine(): void {
  if (ready) return;
  initSync({ module: Buffer.from(ENGINE_WASM_BASE64, "base64") });
  ready = true;
}

let cards: Map<string, EngineCard> | undefined;

/** Les cartes connues du moteur, par code. */
export function engineCards(): Map<string, EngineCard> {
  if (!cards) {
    engine();
    const list = JSON.parse(catalog()) as EngineCard[];
    cards = new Map(list.map((card) => [card.code, card]));
  }
  return cards;
}

export function engineVersion(): string {
  engine();
  return version();
}

/** Les problèmes d'un deck, dans les mots du moteur. Vide s'il est jouable. */
export function validateEngineDeck(list: EngineDeckList): string[] {
  engine();
  return JSON.parse(validate_deck(JSON.stringify(list))) as string[];
}

/** Un deck jouable construit au hasard autour d'une légende, ou `null`. */
export function autoEngineDeck(legend: string, seed: number): EngineDeckList | null {
  engine();
  return JSON.parse(auto_deck(legend, seed)) as EngineDeckList | null;
}

/** Une erreur du moteur porte un message destiné à celui qui a décrit la situation. */
export class EngineError extends Error {}

function guarded<T>(run: () => string): T {
  engine();
  try {
    return JSON.parse(run()) as T;
  } catch (error) {
    throw new EngineError(error instanceof Error ? error.message : String(error));
  }
}

export function judgeSimulate(scenario: unknown, steps: number[]): JudgeReport {
  return guarded(() => judge_simulate(JSON.stringify(scenario), JSON.stringify(steps)));
}

/**
 * `record` peut être donné en texte : il est alors passé tel quel au moteur,
 * sans relecture par JavaScript, qui abîmerait une graine de plus de 53 bits.
 */
export function judgeReview(record: EngineRecord | string, upto: number | null, last: number): JudgeReport {
  const json = typeof record === "string" ? record : JSON.stringify(record);
  return guarded(() => judge_review(json, upto ?? -1, last));
}
