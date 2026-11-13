import type { BotLevel } from "@/lib/engine/types";
import type { SimulationDeck, SimulationGame, SimulationSource } from "@/lib/engine/simulation";

/** L'adversaire d'une série : un deck précis, ou un tirage à chaque partie. */
export type SimulationOpponent =
  | { kind: "fixed" }
  | { kind: "pool"; sources: SimulationSource[]; byLegend: boolean };

/**
 * Une série de parties IA contre IA pour évaluer un deck. Les decks joués sont
 * figés à la création (`deck`, `pool`) : une partie revue rejoue exactement
 * ceux-là, même si le deck Joutes a changé depuis.
 */
export type DeckSimulation = {
  id: string;
  userId: string;
  gameId: string;
  level: BotLevel;
  /** Nombre de parties voulu ; on peut l'augmenter pour compléter la série. */
  target: number;
  deck: SimulationDeck;
  opponent: SimulationOpponent;
  /** Les decks adverses possibles. Un seul pour un adversaire fixe. */
  pool: SimulationDeck[];
  games: SimulationGame[];
  /** Version du moteur (commit) qui a joué les parties : une autre peut les rejouer autrement. */
  engine: string;
  createdAt: string;
  updatedAt: string;
};

/** Une série dans une liste : sans les decks ni les parties. */
export type DeckSimulationSummary = {
  id: string;
  deckName: string;
  legend: string;
  /** Un deck automatique : son nom est celui de sa légende, que la page sait dire dans sa langue. */
  auto: boolean;
  opponent: SimulationOpponent;
  opponentName: string | null;
  level: BotLevel;
  target: number;
  played: number;
  wins: number;
  losses: number;
  updatedAt: string;
};
