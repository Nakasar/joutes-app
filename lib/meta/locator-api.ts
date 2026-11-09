import "server-only";

import {
  legendsByRegistration,
  toLocatorMatches,
  type ParsedLocatorMatch,
  type RawLocatorMatch,
  toLocatorEvent,
  toLocatorStandings,
  type LocatorEvent,
  type LocatorStanding,
  type RawLocatorDeck,
  type RawRegistration,
  type RawRoundStanding,
} from "@/lib/meta/locator";

/** L'API qu'interroge le site du locator ; publique, sans compte, non documentée. */
const LOCATOR_API = "https://api.cloudflare.riftbound.uvsgames.com/hydraproxy/api/v2";

/** Inscrits par page : 315 joueurs se lisent en quatre appels. */
const REGISTRATIONS_PAGE_SIZE = 100;
/** Garde-fou : au-delà, l'évènement n'est pas un tournoi qu'on importe à la main. */
const MAX_REGISTRATION_PAGES = 30;

export class LocatorError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LocatorError";
  }
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${LOCATOR_API}${path}`, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new LocatorError("Le locator n'a pas répondu.");
  }
  if (!response.ok) {
    throw new LocatorError(
      response.status === 404 ? "Introuvable sur le locator." : `Le locator a répondu ${response.status}.`,
      response.status
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new LocatorError("Réponse du locator illisible : son API a peut-être changé.");
  }
}

export async function fetchLocatorEvent(id: number): Promise<LocatorEvent> {
  return toLocatorEvent(await getJson(`/events/${id}/`), id);
}

type Page<T> = { results?: T[]; next?: number | string | null };

/** Toutes les pages d'une liste du locator. */
async function getAllPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= MAX_REGISTRATION_PAGES; page += 1) {
    const data = await getJson<Page<T>>(`${path}${separator}page=${page}&page_size=${REGISTRATIONS_PAGE_SIZE}`);
    if (!Array.isArray(data.results)) {
      throw new LocatorError("Réponse du locator illisible : son API a peut-être changé.");
    }
    items.push(...data.results);
    if (!data.next || data.results.length === 0) return items;
  }
  // Plutôt qu'un classement tronqué sans le dire.
  throw new LocatorError(`Plus de ${MAX_REGISTRATION_PAGES * REGISTRATIONS_PAGE_SIZE} lignes sur le locator : trop pour un import.`);
}

/**
 * Les inscrits, avec la légende que chacun a jouée.
 *
 * La légende n'est que dans le classement des rondes : celui de la dernière
 * phase d'abord, puis des phases d'avant pour les joueurs qui avaient
 * abandonné. Un classement illisible laisse la légende à déduire du deck.
 */
export async function fetchLocatorStandings(event: LocatorEvent): Promise<LocatorStanding[]> {
  const registrations = await getAllPages<RawRegistration>(`/events/${event.id}/registrations/`);
  const legends = new Map<number, string>();
  for (const roundId of event.standingRoundIds) {
    if (registrations.every((raw) => typeof raw.id !== "number" || legends.has(raw.id))) break;
    try {
      const standings = await getAllPages<RawRoundStanding>(`/tournament-rounds/${roundId}/standings/paginated/`);
      for (const [id, legend] of legendsByRegistration(standings)) if (!legends.has(id)) legends.set(id, legend);
    } catch (error) {
      console.warn("Classement du locator illisible :", error);
      break;
    }
  }
  return toLocatorStandings(registrations, legends);
}

export async function fetchLocatorDeck(deckId: string): Promise<RawLocatorDeck> {
  const deck = await getJson<RawLocatorDeck>(`/deckbuilder/decks/${encodeURIComponent(deckId)}/`);
  if (!Array.isArray(deck.sections)) {
    throw new LocatorError("Deck illisible : l'API du locator a peut-être changé.");
  }
  return deck;
}

/** Rondes lues en même temps. */
const ROUND_CONCURRENCY = 4;

/** Tous les matchs terminés du tournoi, ronde par ronde. */
export async function fetchLocatorMatches(event: LocatorEvent): Promise<ParsedLocatorMatch[]> {
  const rounds = [...event.rounds];
  const results: ParsedLocatorMatch[][] = new Array(rounds.length);
  let next = 0;
  const worker = async () => {
    while (next < rounds.length) {
      const index = next++;
      const round = rounds[index];
      const raw = await getAllPages<RawLocatorMatch>(`/tournament-rounds/${round.id}/matches/paginated/`);
      results[index] = toLocatorMatches(raw, round);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ROUND_CONCURRENCY, rounds.length) }, worker));
  return results.flat();
}
