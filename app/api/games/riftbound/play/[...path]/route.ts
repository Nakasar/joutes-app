import {
  addBotAction,
  createTableAction,
  joinTableAction,
  leaveSeatAction,
  loadLobby,
  readTableAction,
  resolveDeckAction,
  searchPlayDecksAction,
  startTableAction,
} from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { playRoutes } from "@/lib/engine/play-api";

/** La page Jouer de Riftbound pour l'app mobile : voir `lib/engine/play-api.ts`. */
export const { GET, POST } = playRoutes({
  lobby: loadLobby,
  searchDecks: searchPlayDecksAction,
  resolveDeck: resolveDeckAction,
  createTable: createTableAction,
  readTable: readTableAction,
  joinTable: joinTableAction,
  addBot: addBotAction,
  leaveSeat: leaveSeatAction,
  startTable: startTableAction,
});
