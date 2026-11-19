"use server";

import { getLimitedEvent, listLimitedEventsOf } from "@/lib/db/limited-events.ts";
import {
  addLimitedBot,
  createLimitedEvent,
  joinLimitedEvent,
  leaveLimitedSeat,
  limitedAccess,
  parseLimitedOptions,
  reconcileLimitedEvent,
  startLimitedEvent,
  summarizeLimitedEvent,
  type LimitedAccess,
} from "@/lib/engine/limited-events.ts";
import {
  guarded,
  parseTableId,
  playableGame,
  requireHost,
  requireViewer,
  viewer,
  type PlayResult,
} from "@/lib/engine/table-actions.ts";
import { isLimitedGame } from "@/lib/engine/limited.ts";
import { engineServer, isBotLevel, TableFailure } from "@/lib/engine/tables.ts";
import type { LimitedEventSummary } from "@/lib/types/LimitedEvent.ts";

/**
 * Les actions d'un scellé ou d'un draft en ligne. Créer un évènement est
 * réservé à Joutes Pro et Joutes Expert (`sub:play-host`), comme héberger une
 * table ; le rejoindre est libre.
 */

export type LimitedEventState = {
  event: LimitedEventSummary;
  /** Mon siège, ou `null` si je n'y suis pas assis. */
  seat: number | null;
  isHost: boolean;
  signedIn: boolean;
  /** L'entrée à l'évènement, une fois lancé. Un visiteur entre en spectateur. */
  access: LimitedAccess | null;
};

/** Le jeu de l'évènement : `riftbound` ou `swu`, dit par la page qui appelle. */
const game = (slug: unknown) => {
  if (!isLimitedGame(slug)) throw new TableFailure("INVALID");
  return playableGame(slug);
};

export async function createLimitedEventAction(slug: unknown, options: unknown): Promise<PlayResult<{ id: string }>> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await requireViewer();
    await requireHost();
    const event = await createLimitedEvent(seated, parseLimitedOptions(options, played.slug), played);
    return { id: event.id };
  });
}

export async function joinLimitedEventAction(slug: unknown, id: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const played = await game(slug);
    await joinLimitedEvent(await requireViewer(), parseTableId(id), played);
    return {};
  });
}

export async function addLimitedBotAction(slug: unknown, id: unknown, level: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await requireViewer();
    if (!isBotLevel(level)) throw new TableFailure("INVALID");
    await addLimitedBot(seated.userId, parseTableId(id), level, played);
    return {};
  });
}

/** `name` : le nom affiché au siège visé, pour ne pas retirer quelqu'un d'autre si la salle a bougé. */
export async function leaveLimitedSeatAction(slug: unknown, id: unknown, seat: unknown, name: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await requireViewer();
    if (typeof seat !== "number" || !Number.isInteger(seat) || typeof name !== "string") {
      throw new TableFailure("INVALID");
    }
    await leaveLimitedSeat(seated.userId, parseTableId(id), seat, name, played);
    return {};
  });
}

export async function startLimitedEventAction(slug: unknown, id: unknown): Promise<PlayResult> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await requireViewer();
    await startLimitedEvent(seated.userId, parseTableId(id), played);
    return {};
  });
}

export async function readLimitedEventAction(slug: unknown, id: unknown): Promise<PlayResult<{ state: LimitedEventState }>> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await viewer();
    const stored = await getLimitedEvent(parseTableId(id));
    if (!stored || stored.gameSlug !== played.slug) throw new TableFailure("NOT_FOUND");
    const event = await reconcileLimitedEvent(stored);
    const seat = seated ? event.seats.findIndex((candidate) => candidate.userId === seated.userId) : -1;
    return {
      state: {
        event: summarizeLimitedEvent(event),
        seat: seat >= 0 ? seat : null,
        isHost: seated?.userId === event.hostId,
        signedIn: seated !== null,
        access: limitedAccess(event, seated),
      },
    };
  });
}

/** Mes scellés et drafts en ligne, les plus récents d'abord. */
export async function listLimitedEventsAction(slug: unknown): Promise<PlayResult<{ events: LimitedEventSummary[] }>> {
  return guarded(async () => {
    const played = await game(slug);
    const seated = await viewer();
    if (!seated || !engineServer()) return { events: [] };
    const stored = await listLimitedEventsOf(seated.userId, played.slug, 5);
    const events = await Promise.all(stored.map(reconcileLimitedEvent));
    return { events: events.map(summarizeLimitedEvent) };
  });
}
