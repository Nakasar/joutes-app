import "server-only";

import { initSync, swu_auto_deck, swu_catalog, swu_validate_deck } from "@/lib/engine/swu/pkg/joutes_swu.js";
import type { SwuDeckList, SwuEngineCard } from "@/lib/engine/swu/types";
import { SWU_WASM_BASE64 } from "@/lib/engine/swu/wasm.generated";

/**
 * Le moteur de Star Wars: Unlimited côté serveur : son catalogue et la
 * vérification d'un deck. Les parties tournent dans le navigateur.
 */
let ready = false;

function engine(): void {
  if (ready) return;
  initSync({ module: Buffer.from(SWU_WASM_BASE64, "base64") });
  ready = true;
}

let cards: Map<string, SwuEngineCard> | undefined;

/** Les cartes connues du moteur, par code (« SOR-005 »). */
export function swuEngineCards(): Map<string, SwuEngineCard> {
  if (!cards) {
    engine();
    const list = JSON.parse(swu_catalog()) as SwuEngineCard[];
    cards = new Map(list.map((card) => [card.code, card]));
  }
  return cards;
}

/** Les problèmes d'un deck au format Premier, dans les mots du moteur. Vide s'il est jouable. */
export function validateSwuDeck(list: SwuDeckList): string[] {
  engine();
  return JSON.parse(swu_validate_deck(JSON.stringify(list))) as string[];
}

let leaders: string[] | undefined;

/** Les leaders autour desquels le moteur sait construire un deck automatique. */
export function swuAutoLeaders(): string[] {
  leaders ??= [...swuEngineCards().values()]
    .filter((card) => card.kind === "leader" && card.coverage !== "none")
    .map((card) => card.code);
  return leaders;
}

/**
 * Un deck automatique autour d'un leader. La base est tirée (par la graine)
 * parmi celles qui partagent un aspect avec lui, pour un deck sans pénalité.
 */
export function autoSwuDeck(leader: string, seed: number): SwuDeckList | null {
  const cards = swuEngineCards();
  const chosen = cards.get(leader);
  if (!chosen || chosen.kind !== "leader" || chosen.coverage === "none") return null;
  const bases = [...cards.values()].filter((card) => card.kind === "base" && card.coverage !== "none");
  const fitting = bases.filter((base) => base.aspects.some((aspect) => chosen.aspects.includes(aspect)));
  const pool = fitting.length > 0 ? fitting : bases;
  if (pool.length === 0) return null;
  return JSON.parse(swu_auto_deck(leader, pool[seed % pool.length].code, seed)) as SwuDeckList | null;
}
