import type { PickerDeck } from "@/components/play/DeckPicker";
import type { SimError, SimResult, Simulator, SimulatorDeck } from "@/lib/engine/simulation-actions";
import type { SimulationDeck, SimulationGame, SimulationSource } from "@/lib/engine/simulation";
import type { BotLevel } from "@/lib/engine/types";
import type { DeckSimulation } from "@/lib/types/DeckSimulation";

export type { SimError };

/** Un deck de la page Simuler : la fiche que la liste des decks sait montrer, avec la liste du moteur. */
export type SimulatorPickerDeck = PickerDeck & SimulatorDeck;

/** Ce que les écrans du simulateur lisent d'une légende ou d'un leader. */
export type SimulatorCards = Record<string, { name: string; image?: string; domains?: string[] } | undefined>;

/**
 * Ce qu'un jeu fournit aux écrans du simulateur (`SimulatorSetup`,
 * `SimulationResults`) : ses actions serveur, son moteur dans un worker, et
 * les quelques mots qui changent d'un jeu à l'autre.
 */
export type SimulatorKit<D extends SimulatorPickerDeck = SimulatorPickerDeck> = {
  /** La page Jouer du jeu (« /games/riftbound/play »). */
  home: string;
  /** La version du moteur chargé dans le navigateur. */
  engine: string;
  /**
   * L'espace de textes du jeu : une clé `sim.*` qui s'y trouve remplace celle
   * de `Games.Play` (le leader de SWU à la place de la légende, par exemple).
   */
  words?: "Games.PlaySwu";
  /** Les ensembles d'adversaires proposés, et ceux cochés d'emblée. */
  sources: SimulationSource[];
  defaultSources: SimulationSource[];
  /** La couleur des pastilles (domaines, aspects). */
  colors: Record<string, string>;
  /** Ce que la liste des decks demande en plus pour ce jeu. */
  picker?: {
    search?: (query: string) => Promise<D[]>;
    texts?: { auto?: string; randomHint?: string; search?: string };
  };
  /** Durée attendue d'une partie dans le navigateur, en secondes. */
  secondsPerGame: Record<BotLevel, number>;
  actions: {
    load: () => Promise<SimResult<{ simulator: Simulator<D> }>>;
    create: (input: unknown) => Promise<SimResult<{ id: string }>>;
    get: (id: string) => Promise<SimResult<{ simulation: DeckSimulation; name: string }>>;
    record: (id: string, games: SimulationGame[]) => Promise<SimResult<{ added: number }>>;
    extend: (id: string, more: number) => Promise<SimResult<{ target: number }>>;
    remove: (id: string) => Promise<SimResult>;
  };
  /** Le worker qui joue les parties : message `{ id, config, seed, bots }`, réponse `{ id, summary | error }`. */
  createWorker: () => Worker;
  /** La configuration de la partie `n`, dans le format du moteur du jeu. */
  config: (n: number, mine: SimulationDeck, opponent: SimulationDeck, names: [string, string]) => unknown;
  /** Prépare la table spectateur pour revoir une partie, et rend l'adresse où aller. */
  watch: (config: unknown, seed: number, level: BotLevel) => string;
};
