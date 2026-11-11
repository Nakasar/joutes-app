"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordSimulationGamesAction } from "@/app/[locale]/(app)/games/riftbound/play/simulate/actions";
import {
  drawOpponent,
  gameConfig,
  toSimulationGame,
  type EngineGameSummary,
  type SimulationDeck,
  type SimulationGame,
} from "@/lib/engine/simulation";
import type { DeckSimulation } from "@/lib/types/DeckSimulation";

/** Les parties jouées sont envoyées par paquets de cette taille, ou à l'arrêt. */
const FLUSH_EVERY = 5;

export type SimulationRunner = {
  games: SimulationGame[];
  running: boolean;
  /** La dernière erreur (moteur ou enregistrement), à montrer. */
  error: string | null;
  start: () => void;
  pause: () => void;
  /** Secondes par partie mesurées pendant cette série, ou `null` avant la première. */
  pace: number | null;
};

type Pending = { resolve: (summary: EngineGameSummary) => void; reject: (error: Error) => void };

/**
 * Joue les parties d'une série dans un worker, une à la fois, jusqu'à
 * `target`. Chaque partie tire son adversaire, sa graine, et son siège selon
 * son rang ; les résultats partent au serveur par paquets.
 */
export function useSimulationRunner(
  simulation: DeckSimulation | null,
  /** Les noms des sièges à la table : le deck évalué, puis son adversaire. */
  names: (opponent: SimulationDeck) => [string, string],
): SimulationRunner {
  const [games, setGames] = useState<SimulationGame[]>(simulation?.games ?? []);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pace, setPace] = useState<number | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const stop = useRef(false);
  const unsent = useRef<SimulationGame[]>([]);
  const played = useRef<SimulationGame[]>(simulation?.games ?? []);
  const target = useRef(simulation?.target ?? 0);

  useEffect(() => {
    played.current = simulation?.games ?? [];
    target.current = simulation?.target ?? 0;
    setGames(played.current);
  }, [simulation]);

  const ensureWorker = useCallback((): Worker => {
    if (worker.current) return worker.current;
    const created = new Worker(new URL("./simulation.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (message: MessageEvent<{ id: number; summary?: EngineGameSummary; error?: string }>) => {
      const job = pending.current.get(message.data.id);
      if (!job) return;
      pending.current.delete(message.data.id);
      if (message.data.summary) job.resolve(message.data.summary);
      else job.reject(new Error(message.data.error ?? "moteur"));
    };
    worker.current = created;
    return created;
  }, []);

  useEffect(
    () => () => {
      stop.current = true;
      worker.current?.terminate();
      worker.current = null;
    },
    [],
  );

  const flush = useCallback(async () => {
    if (!simulation || unsent.current.length === 0) return;
    const batch = unsent.current;
    unsent.current = [];
    const result = await recordSimulationGamesAction(simulation.id, batch);
    if (!result.ok) {
      // Gardées pour le prochain envoi : une coupure ne perd pas de parties.
      unsent.current = [...batch, ...unsent.current];
      setError(result.error);
    }
  }, [simulation]);

  const start = useCallback(() => {
    if (!simulation || running) return;
    stop.current = false;
    setRunning(true);
    setError(null);
    const byLegend = simulation.opponent.kind === "pool" && simulation.opponent.byLegend;
    let nextId = 1;

    const playOne = (n: number) => {
      const opponent = drawOpponent(simulation.pool, byLegend, Math.random);
      const seed = Math.floor(Math.random() * 2 ** 31) + 1;
      const config = gameConfig(n, simulation.deck, opponent, names(opponent));
      const id = nextId++;
      return new Promise<SimulationGame>((resolve, reject) => {
        pending.current.set(id, {
          resolve: (summary) => resolve(toSimulationGame(n, opponent.key, summary)),
          reject,
        });
        ensureWorker().postMessage({ id, config, seed, bots: [simulation.level, simulation.level] });
      });
    };

    void (async () => {
      try {
        while (!stop.current) {
          const done = new Set(played.current.map((game) => game.n));
          let n = 0;
          while (done.has(n)) n++;
          if (n >= target.current) break;
          const began = performance.now();
          const game = await playOne(n);
          const seconds = (performance.now() - began) / 1000;
          setPace((previous) => (previous === null ? seconds : previous * 0.8 + seconds * 0.2));
          played.current = [...played.current, game];
          unsent.current.push(game);
          setGames(played.current);
          if (unsent.current.length >= FLUSH_EVERY) await flush();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        await flush();
        setRunning(false);
      }
    })();
  }, [simulation, running, names, ensureWorker, flush]);

  const pause = useCallback(() => {
    // La partie en cours se termine, puis tout s'arrête et part au serveur.
    stop.current = true;
  }, []);

  return { games, running, error, start, pause, pace };
}
