"use client";

import { useEffect, useState } from "react";

import {
  addBotAction,
  joinTableAction,
  leaveSeatAction,
  loadLobby,
  readTableAction,
  startTableAction,
  type Lobby,
} from "@/app/[locale]/(app)/games/riftbound/play/actions";
import { DeckPicker } from "@/components/play/DeckPicker";
import { GameTable } from "@/components/play/GameTable";
import { TableRoom, type RoomGameProps, type RoomKit } from "@/components/play/TableRoom";
import { useOnlineGame } from "@/components/play/useOnlineGame";
import { useTableCards } from "@/components/play/useTableCards";
import type { DeckChoice } from "@/lib/engine/tables";

const ACTIONS: RoomKit["actions"] = {
  read: readTableAction,
  join: joinTableAction,
  addBot: addBotAction,
  leave: leaveSeatAction,
  start: startTableAction,
};

/** Une table en ligne de Riftbound : la salle d'attente, puis la partie sur le serveur de parties. */
export function OnlineRoom() {
  const cards = useTableCards();
  return (
    <TableRoom
      kit={{
        home: "/games/riftbound/play",
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
  const cards = useTableCards();
  const [lobby, setLobby] = useState<Lobby | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadLobby().then((result) => {
      if (!cancelled && result.ok) setLobby(result.lobby);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DeckPicker
      id="join-deck"
      decks={lobby?.decks ?? []}
      legends={lobby?.legends ?? []}
      cards={cards}
      value={value}
      onChange={(next) => {
        if (next.kind !== "random") onChange(next);
      }}
    />
  );
}

/** La partie d'une table lancée, sur le serveur de parties. */
function OnlineTable({ url, renew, onSilent, unreachable, afterResult }: RoomGameProps) {
  const cards = useTableCards();
  const feed = useOnlineGame(url, renew);

  const silent = !feed.update;
  useEffect(() => {
    onSilent(silent);
  }, [silent, onSilent]);

  if (feed.status === "error" && !feed.update) return unreachable;
  return <GameTable feed={feed} cards={cards} afterResult={afterResult} />;
}
