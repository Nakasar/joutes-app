"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { recordSimulationGamesAction, type SimError } from "@/app/[locale]/(app)/games/riftbound/play/simulate/actions";
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
/** Le serveur n'accepte pas plus de parties par envoi. */
const MAX_BATCH = 50;
/** Des erreurs qu'un nouvel essai ne corrigera pas : la série s'arrête. */
const FATAL: SimError[] = ["NOT_FOUND", "INVALID", "UNAUTHENTICATED"];

/** Un code d'erreur d'enregistrement (`SimError`), ou `ENGINE` pour un échec du moteur. */
export type SimulationRunnerError = SimError | "ENGINE";

export type SimulationRunner = {
  games: SimulationGame[];
  running: boolean;
  /** La dernière erreur (moteur ou enregistrement), à traduire par `sim.error.<code>`. */
  error: SimulationRunnerError | null;
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
  const [error, setError] = useState<SimulationRunnerError | null>(null);
  const [pace, setPace] = useState<number | null>(null);
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, Pending>());
  const stop = useRef(false);
  const unsent = useRef<SimulationGame[]>([]);
  const played = useRef<SimulationGame[]>(simulation?.games ?? []);
  const target = useRef(simulation?.target ?? 0);

  // Une autre série : on repart de ses parties. Pour la même série (parties
  // ajoutées), on ne touche qu'au nombre visé : les parties jouées entre-temps
  // ne sont que dans `played`.
  const simulationId = simulation?.id;
  useEffect(() => {
    played.current = simulation?.games ?? [];
    setGames(played.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seulement au changement de série
  }, [simulationId]);
  useEffect(() => {
    target.current = simulation?.target ?? 0;
  }, [simulation?.target]);

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

  const flush = useCallback(async () => {
    if (!simulation) return;
    while (unsent.current.length > 0) {
      const batch = unsent.current.slice(0, MAX_BATCH);
      unsent.current = unsent.current.slice(MAX_BATCH);
      let code: SimError | null = null;
      try {
        const result = await recordSimulationGamesAction(simulation.id, batch);
        if (!result.ok) code = result.error;
      } catch {
        // Coupure réseau, serveur redéployé : l'action rejette au lieu de répondre.
        code = "SERVER";
      }
      if (code) {
        // Gardées pour le prochain envoi : une coupure ne perd pas de parties.
        unsent.current = [...batch, ...unsent.current];
        setError(code);
        if (FATAL.includes(code)) stop.current = true;
        return;
      }
    }
  }, [simulation]);

  // En quittant la page : la partie en cours est abandonnée, celles déjà
  // jouées partent au serveur sans attendre la réponse.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);
  useEffect(
    () => () => {
      stop.current = true;
      worker.current?.terminate();
      worker.current = null;
      for (const job of pending.current.values()) job.reject(new Error("arrêt"));
      pending.current.clear();
      void flushRef.current();
    },
    [],
  );

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
        if (!stop.current) {
          console.error("simulation", cause);
          setError("ENGINE");
        }
      } finally {
        try {
          await flush();
        } finally {
          setRunning(false);
        }
      }
    })();
  }, [simulation, running, names, ensureWorker, flush]);

  const pause = useCallback(() => {
    // La partie en cours se termine, puis tout s'arrête et part au serveur.
    stop.current = true;
  }, []);

  return { games, running, error, start, pause, pace };
}
