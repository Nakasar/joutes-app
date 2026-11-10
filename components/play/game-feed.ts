import type { EngineAction, EngineTold, EngineUpdate } from "@/lib/engine/types";

/**
 * Ce que la table reçoit, d'où que vienne la partie : le moteur chargé dans le
 * navigateur (contre l'IA) ou le serveur de parties (en ligne).
 */
export type GameFeed = {
  status: "loading" | "ready" | "reconnecting" | "error";
  /** Message du moteur ou du serveur, tel quel. */
  error: string | null;
  update: EngineUpdate | null;
  /** Tout le récit depuis le début de la partie. */
  journal: EngineTold[];
  /** Mon siège, ou `null` pour un spectateur. */
  seat: number | null;
  /** Sièges dont le joueur est déconnecté (en ligne seulement). */
  away: number[];
  act: (action: EngineAction) => void;
};

/** Le journal ne garde que ce qui se raconte. */
export function appendJournal(journal: EngineTold[], events: EngineTold[]): EngineTold[] {
  const told = events.filter((event) => event.text);
  return told.length === 0 ? journal : [...journal, ...told];
}
