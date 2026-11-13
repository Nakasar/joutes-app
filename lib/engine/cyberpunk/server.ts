import "server-only";

import {
  cp_catalog,
  cp_validate_deck,
  initSync,
} from "@/lib/engine/cyberpunk/pkg/joutes_cyberpunk.js";
import type { CpDeckList, CpEngineCard } from "@/lib/engine/cyberpunk/types";
import { CP_WASM_BASE64 } from "@/lib/engine/cyberpunk/wasm.generated";

/**
 * Le moteur de Cyberpunk TCG côté serveur : son catalogue et la vérification
 * d'un deck. Les parties tournent dans le navigateur.
 */
let ready = false;

function engine(): void {
  if (ready) return;
  initSync({ module: Buffer.from(CP_WASM_BASE64, "base64") });
  ready = true;
}

let cards: Map<string, CpEngineCard> | undefined;

/** Les cartes connues du moteur, par code (« WNC-001 »). */
export function cpEngineCards(): Map<string, CpEngineCard> {
  if (!cards) {
    engine();
    const list = JSON.parse(cp_catalog()) as CpEngineCard[];
    cards = new Map(list.map((card) => [card.code, card]));
  }
  return cards;
}

/** Les problèmes d'un deck construit, dans les mots du moteur. Vide s'il est jouable. */
export function validateCpDeck(list: CpDeckList): string[] {
  engine();
  return JSON.parse(cp_validate_deck(JSON.stringify(list))) as string[];
}

let legends: string[] | undefined;

/** Les Légendes autour desquelles le moteur sait construire un deck automatique. */
export function cpAutoLegends(): string[] {
  legends ??= [...cpEngineCards().values()]
    .filter((card) => card.kind === "legend" && card.coverage !== "none")
    .map((card) => card.code);
  return legends;
}
