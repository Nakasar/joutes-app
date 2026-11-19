import "server-only";

import {
  addLimitedBotAction,
  createLimitedEventAction,
  joinLimitedEventAction,
  leaveLimitedSeatAction,
  listLimitedEventsAction,
  readLimitedEventAction,
  startLimitedEventAction,
} from "@/app/[locale]/(app)/games/riftbound/play/limited/actions";
import type { LimitedApi } from "@/lib/engine/play-api";
import type { LimitedGameKey } from "@/lib/engine/limited";

/** Le scellé et le draft en ligne d'un jeu, pour l'app mobile (`playRoutes`). */
export function limitedRoutes(game: LimitedGameKey): LimitedApi {
  return {
    list: () => listLimitedEventsAction(game),
    create: (options) => createLimitedEventAction(game, options),
    read: (id) => readLimitedEventAction(game, id),
    join: (id) => joinLimitedEventAction(game, id),
    addBot: (id, level) => addLimitedBotAction(game, id, level),
    leaveSeat: (id, seat, name) => leaveLimitedSeatAction(game, id, seat, name),
    start: (id) => startLimitedEventAction(game, id),
  };
}
