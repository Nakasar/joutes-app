import {
  addSwuBotAction,
  createSwuTableAction,
  joinSwuTableAction,
  leaveSwuSeatAction,
  loadSwuLobby,
  readSwuTableAction,
  resolveSwuDeckAction,
  searchSwuPlayDecksAction,
  startSwuTableAction,
} from "@/app/[locale]/(app)/games/swu/play/actions";
import { playRoutes } from "@/lib/engine/play-api";

/** La page Jouer de Star Wars: Unlimited pour l'app mobile : voir `lib/engine/play-api.ts`. */
export const { GET, POST } = playRoutes({
  lobby: loadSwuLobby,
  searchDecks: searchSwuPlayDecksAction,
  resolveDeck: resolveSwuDeckAction,
  // Une table SWU est toujours un duel : le mode envoyé est ignoré.
  createTable: (_mode, choice) => createSwuTableAction(choice),
  readTable: readSwuTableAction,
  joinTable: joinSwuTableAction,
  addBot: addSwuBotAction,
  leaveSeat: leaveSwuSeatAction,
  startTable: startSwuTableAction,
});
