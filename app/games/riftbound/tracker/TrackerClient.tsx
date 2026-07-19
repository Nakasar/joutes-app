"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, RotateCcw } from "lucide-react";
import PlayerCard, { type Player } from "./PlayerCard";

const STORAGE_KEY = "riftbound-tracker-state";
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;

function newPlayer(): Player {
  return { id: nanoid(), name: "", score: 0, energy: 0, power: 0, legend: null };
}

function isValidPlayers(value: unknown): value is Player[] {
  return (
    Array.isArray(value) &&
    value.length >= MIN_PLAYERS &&
    value.length <= MAX_PLAYERS &&
    value.every(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.name === "string" &&
        typeof p.score === "number" &&
        typeof p.energy === "number" &&
        typeof p.power === "number"
    )
  );
}

export default function TrackerClient() {
  const t = useTranslations("Games.Tracker");
  const [players, setPlayers] = useState<Player[]>([newPlayer(), newPlayer()]);
  const [hydrated, setHydrated] = useState(false);

  // Loads any saved session once on mount — after the first render, so the
  // server-rendered markup and the client's initial render still match
  // (avoids a hydration mismatch) — then persists every change from then on,
  // so an accidental refresh mid-game doesn't wipe the table's scores.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      if (isValidPlayers(parsed)) {
        setPlayers(parsed);
      }
    } catch {
      // Ignore corrupt or unavailable storage — start from the defaults.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
    } catch {
      // Ignore unavailable storage (e.g. private browsing).
    }
  }, [players, hydrated]);

  const updatePlayer = (id: string, updated: Player) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? updated : p)));
  };

  const addPlayer = () => {
    setPlayers((prev) => (prev.length >= MAX_PLAYERS ? prev : [...prev, newPlayer()]));
  };

  const removePlayer = (id: string) => {
    setPlayers((prev) => (prev.length <= MIN_PLAYERS ? prev : prev.filter((p) => p.id !== id)));
  };

  const resetGame = () => {
    setPlayers((prev) => prev.map((p) => ({ ...p, score: 0, energy: 0, power: 0 })));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" onClick={addPlayer} disabled={players.length >= MAX_PLAYERS}>
          <Plus className="h-4 w-4 mr-2" />
          {t("addPlayer")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              {t("resetGame")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("resetConfirmTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("resetConfirmDescription")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("resetConfirmCancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={resetGame}>{t("resetConfirmAction")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {players.map((player, index) => (
          <PlayerCard
            key={player.id}
            player={player}
            index={index}
            canRemove={players.length > MIN_PLAYERS}
            onChange={(updated) => updatePlayer(player.id, updated)}
            onRemove={() => removePlayer(player.id)}
          />
        ))}
      </div>
    </div>
  );
}
