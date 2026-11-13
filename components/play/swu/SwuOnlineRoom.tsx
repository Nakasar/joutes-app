"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  addSwuBotAction,
  joinSwuTableAction,
  leaveSwuSeatAction,
  loadSwuLobby,
  readSwuTableAction,
  searchSwuPlayDecksAction,
  startSwuTableAction,
  type SwuLobby,
  type SwuLobbyDeck,
} from "@/app/[locale]/(app)/games/swu/play/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { SwuTable } from "@/components/play/swu/SwuTable";
import { useSwuOnlineGame } from "@/components/play/swu/useSwuOnlineGame";
import { useSwuTableCards } from "@/components/play/swu/useSwuTableCards";
import { TableRoom, type RoomGameProps, type RoomKit } from "@/components/play/TableRoom";
import { ASPECT_HEX, swuPickerCards } from "@/lib/engine/swu/cards";
import type { DeckChoice } from "@/lib/engine/tables";

const ACTIONS: RoomKit["actions"] = {
  read: readSwuTableAction,
  join: joinSwuTableAction,
  addBot: addSwuBotAction,
  leave: leaveSwuSeatAction,
  start: startSwuTableAction,
};

const searchDecks = (query: string) =>
  searchSwuPlayDecksAction(query).then((result) => (result.ok ? result.decks : []));

/** Une table en ligne de Star Wars: Unlimited : la salle d'attente, puis la partie sur le serveur de parties. */
export function SwuOnlineRoom() {
  const cards = useSwuTableCards();
  return (
    <TableRoom
      kit={{
        home: "/games/swu/play",
        actions: ACTIONS,
        cardName: (code) => cards[code]?.name,
        Picker: JoinPicker,
        Game: OnlineTable,
      }}
    />
  );
}

/** Le deck de la personne qui s'assoit : les decks de la page Jouer, chargés à la demande. */
function JoinPicker({ value, onChange }: { value: DeckChoice | null; onChange: (choice: DeckChoice) => void }) {
  const ts = useTranslations("Games.PlaySwu");
  const cards = useSwuTableCards();
  const [lobby, setLobby] = useState<SwuLobby | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadSwuLobby().then((result) => {
      if (!cancelled && result.ok) setLobby(result.lobby);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickerCards = useMemo(() => swuPickerCards(cards), [cards]);

  return (
    <DeckPicker<SwuLobbyDeck>
      id="swu-join-deck"
      decks={lobby?.decks ?? []}
      legends={lobby?.leaders ?? []}
      cards={pickerCards}
      colors={ASPECT_HEX}
      texts={{ auto: ts("lobby.deckAuto"), randomHint: ts("lobby.deckRandomHint"), search: ts("lobby.deckSearch") }}
      search={searchDecks}
      value={value}
      onChange={(next) => {
        if (next.kind !== "random") onChange(next);
      }}
    />
  );
}

/** La partie d'une table lancée, sur le serveur de parties. */
function OnlineTable({ url, renew, onSilent, unreachable, afterResult }: RoomGameProps) {
  const cards = useSwuTableCards();
  const feed = useSwuOnlineGame(url, cards, renew);

  const silent = !feed.update;
  useEffect(() => {
    onSilent(silent);
  }, [silent, onSilent]);

  if (feed.status === "error" && !feed.update) return unreachable;
  return <SwuTable feed={feed} cards={cards} afterResult={afterResult} />;
}
