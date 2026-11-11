import type { DeckCards } from "@/lib/decks/contents";
import { toCatalogId, toEngineCode } from "@/lib/engine/cards";
import { toEngineDeck } from "@/lib/engine/deck";
import type { EngineDeckList } from "@/lib/engine/types";

/** Ce que le moteur a reçu en plus du deck tel qu'il est rangé. */
export type DeckCompletion = "champion" | "battlefields";

export type CompletionCatalog = {
  /** Les tags d'une carte du moteur. */
  tagsOf: (code: string) => readonly string[] | undefined;
  /** Les champions (unités) que cette légende peut choisir, codes du moteur, dans un ordre stable. */
  championsOf: (legend: string) => readonly string[];
  /** Trois champs de bataille jouables pour cette légende, ou rien. */
  battlefieldsFor: (legend: string) => readonly string[];
  /** Les refus du moteur ; vide si le deck est jouable. */
  validate: (list: EngineDeckList) => string[];
};

export type CompletedDeck = {
  list: EngineDeckList | null;
  problems: string[];
  completed: DeckCompletion[];
};

/**
 * Traduit un deck pour le moteur, en complétant ce que son origine n'a pas pu
 * fournir. Le locator Riftbound ne publie d'un deck que le deck principal (39
 * cartes), les runes et la réserve : la légende vient du classement, mais le
 * champion choisi et les champs de bataille restent réservés aux connectés.
 *
 * - Le champion choisi est un champion de la légende (règle 103.3.a.2) : de
 *   préférence celui dont le deck principal a déjà le plus d'exemplaires (moins
 *   de 3, règle 103.3.b), sinon le premier du catalogue que le moteur accepte.
 * - Les champs de bataille sont ceux que le moteur choisirait pour un deck
 *   automatique de la même légende.
 *
 * Un deck qui a déjà son champion et ses champs de bataille passe tel quel.
 */
export function completeEngineDeck(cards: DeckCards | undefined, catalog: CompletionCatalog): CompletedDeck {
  const base = toEngineDeck(cards, catalog.tagsOf);
  const missingChampion = base.problems.some((problem) => problem.kind === "noChampion");
  const legendCard = cards?.legend?.find((entry) => entry.quantity > 0)?.cardId;
  const legend = legendCard ? toEngineCode(legendCard) : null;
  if (!legend || (!missingChampion && (base.list?.battlefields.length ?? 0) > 0)) {
    return finish(base, [], catalog);
  }

  const completed: DeckCompletion[] = [];
  let filled: DeckCards = { ...cards };

  if ((cards?.battlefields ?? []).every((entry) => entry.quantity <= 0)) {
    const battlefields = catalog.battlefieldsFor(legend);
    if (battlefields.length > 0) {
      filled = { ...filled, battlefields: battlefields.map((code) => ({ cardId: toCatalogId(code), quantity: 1 })) };
      completed.push("battlefields");
    }
  }

  if (!missingChampion) return finish(toEngineDeck(filled, catalog.tagsOf), completed, catalog);

  const inMain = new Map<string, number>();
  for (const entry of filled.maindeck ?? []) {
    const code = toEngineCode(entry.cardId);
    if (code) inMain.set(code, (inMain.get(code) ?? 0) + Math.max(0, Math.floor(entry.quantity)));
  }
  const candidates = [...catalog.championsOf(legend)]
    .map((code, order) => ({ code, order, copies: inMain.get(code) ?? 0 }))
    .filter((candidate) => candidate.copies < 3)
    .sort((a, b) => b.copies - a.copies || a.order - b.order);

  let first: CompletedDeck | null = null;
  for (const candidate of candidates) {
    const attempt = finish(
      toEngineDeck({ ...filled, champions: [{ cardId: toCatalogId(candidate.code), quantity: 1 }] }, catalog.tagsOf),
      [...completed, "champion"],
      catalog,
    );
    if (attempt.list) return attempt;
    first ??= attempt;
  }
  return first ?? finish(base, completed, catalog);
}

function finish(
  outcome: ReturnType<typeof toEngineDeck>,
  completed: DeckCompletion[],
  catalog: CompletionCatalog,
): CompletedDeck {
  if (!outcome.list) {
    return { list: null, problems: outcome.problems.map((problem) => problem.kind), completed: [] };
  }
  const refused = catalog.validate(outcome.list);
  return refused.length === 0
    ? { list: outcome.list, problems: [], completed }
    : { list: null, problems: refused, completed: [] };
}
