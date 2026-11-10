"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { appendJournal, type GameFeed } from "@/components/play/game-feed";
import { loadEngine, type BrowserEngine } from "@/lib/engine/browser";
import type { BotLevel, EngineAction, EngineRecord, EngineTold, EngineUpdate } from "@/lib/engine/types";

/** Une partie contre l'IA telle qu'elle est gardée dans le navigateur. */
export type SoloSave = {
  seat: number;
  bots: (BotLevel | null)[];
  record: EngineRecord;
};

export const SOLO_STORAGE_KEY = "joutes.play.solo";

export function readSoloSave(): SoloSave | null {
  try {
    const raw = window.localStorage.getItem(SOLO_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SoloSave) : null;
  } catch {
    return null;
  }
}

export function writeSoloSave(save: SoloSave | null): void {
  try {
    if (save) window.localStorage.setItem(SOLO_STORAGE_KEY, JSON.stringify(save));
    else window.localStorage.removeItem(SOLO_STORAGE_KEY);
  } catch {
    // Stockage refusé (navigation privée) : la partie se joue, sans reprise.
  }
}

/** Le temps laissé pour lire un coup du robot avant le suivant. */
const BOT_DELAY_MS = 650;

type Table = InstanceType<BrowserEngine["Table"]>;

/**
 * Une partie contre l'IA, jouée entièrement dans le navigateur. Le journal de
 * la partie est réécrit après chaque coup : recharger la page la reprend.
 */
export function useSoloGame(save: SoloSave | null): GameFeed {
  const table = useRef<Table | null>(null);
  const seen = useRef(0);
  const [status, setStatus] = useState<GameFeed["status"]>("loading");
  const [error, setError] = useState<string | null>(null);
  const [update, setUpdate] = useState<EngineUpdate | null>(null);
  const [journal, setJournal] = useState<EngineTold[]>([]);
  // Incrémenté à chaque changement d'état du moteur : relance l'effet des robots.
  const [tick, setTick] = useState(0);

  const seat = save?.seat ?? 0;

  const refresh = useCallback(() => {
    const current = table.current;
    if (!current || !save) return;
    const next = JSON.parse(current.update(seat, seen.current)) as EngineUpdate;
    seen.current = next.seq;
    setUpdate(next);
    setJournal((previous) => appendJournal(previous, next.events));
    writeSoloSave({ ...save, record: JSON.parse(current.record()) as EngineRecord });
    setTick((value) => value + 1);
  }, [save, seat]);

  useEffect(() => {
    if (!save) return;
    let cancelled = false;
    loadEngine()
      .then((engine) => {
        if (cancelled) return;
        table.current = engine.Table.restore(JSON.stringify(save.record), JSON.stringify(save.bots));
        seen.current = 0;
        setJournal([]);
        setStatus("ready");
        refresh();
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      });
    return () => {
      cancelled = true;
      table.current?.free();
      table.current = null;
    };
    // La partie n'est ouverte qu'une fois par sauvegarde : `refresh` change
    // d'identité avec elle.
  }, [save, refresh]);

  useEffect(() => {
    const current = table.current;
    if (!current || status !== "ready") return;
    const next = current.to_act();
    if (next < 0 || !current.is_bot(next)) return;
    const timer = window.setTimeout(() => {
      if (table.current !== current) return;
      current.bot_step();
      refresh();
    }, BOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [tick, status, refresh]);

  const act = useCallback(
    (action: EngineAction) => {
      const current = table.current;
      if (!current) return;
      try {
        current.act(seat, JSON.stringify(action));
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
      refresh();
    },
    [seat, refresh],
  );

  return { status, error, update, journal, seat, away: [], act };
}
