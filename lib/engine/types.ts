/**
 * Les messages du moteur de jeu (dépôt joutes-engine), tels qu'il les écrit en
 * JSON. La table de jeu ne connaît que ces formes : qu'ils viennent du moteur
 * chargé dans le navigateur ou du serveur de parties ne change rien.
 */

export type EngineMode = "duel" | "ffa3" | "ffa4" | "teams";
export type BotLevel = "easy" | "normal" | "hard";

export const ENGINE_MODES: EngineMode[] = ["duel", "ffa3", "ffa4", "teams"];
export const BOT_LEVELS: BotLevel[] = ["easy", "normal", "hard"];

export function modePlayers(mode: EngineMode): number {
  return mode === "duel" ? 2 : mode === "ffa3" ? 3 : 4;
}

/** Une liste de deck par codes du moteur (« OGN-001 »). */
export type EngineDeckList = {
  legend: string;
  champion: string;
  /** Le deck principal sans le champion choisi. */
  main: string[];
  runes: string[];
  battlefields: string[];
};

export type EngineConfig = {
  mode: EngineMode;
  players: { name: string; deck: EngineDeckList }[];
  first_player?: number | null;
  auto_pass?: boolean;
  allow_unimplemented?: boolean;
};

export type EngineLoc = { Base: number } | { Bf: number };

export type EngineZone =
  | "MainDeck"
  | "RuneDeck"
  | "Hand"
  | "Trash"
  | "Banish"
  | "Champion"
  | "Legend"
  | "Chain"
  | "BfZone"
  | "Limbo"
  | { Board: EngineLoc }
  | { Facedown: number };

/** Une action : on renvoie au moteur, telle quelle, l'une de celles qu'il propose. */
export type EngineAction = { type: string; [key: string]: unknown };

export type EngineObj = {
  id: number;
  code: string | null;
  name: string | null;
  owner: number;
  controller: number;
  zone: EngineZone;
  token: boolean;
  exhausted: boolean;
  damage: number;
  buffs: number;
  stunned: boolean;
  might: number | null;
  keywords: string[];
  role: "Attacker" | "Defender" | null;
};

export type EnginePlayer = {
  seat: number;
  name: string;
  team: number;
  alive: boolean;
  points: number;
  hand_count: number;
  hand: EngineObj[] | null;
  deck_count: number;
  rune_deck_count: number;
  trash: EngineObj[];
  banish: EngineObj[];
  pool: { energy: number; power: number[] };
  legend: EngineObj;
  champion: EngineObj | null;
  runes_ready: number;
  runes_exhausted: number;
};

export type EngineBattlefield = {
  index: number;
  card: EngineObj;
  controller: number | null;
  contested_by: number | null;
  units: EngineObj[];
  facedown: EngineObj[];
};

export type EngineChainItem = {
  id: number;
  kind: string;
  controller: number;
  pending: boolean;
  code: string;
  name: string;
  source: number | null;
  ability: number;
  targets: unknown[];
};

export type EngineResult = { winners: number[]; reason: string };

export type EngineView = {
  mode: EngineMode;
  turn: number;
  turn_seat: number;
  step: string;
  victory_score: number;
  points: number[];
  players: EnginePlayer[];
  battlefields: EngineBattlefield[];
  bases: EngineObj[][];
  chain: EngineChainItem[];
  showdown: { bf: number; [key: string]: unknown } | null;
  pending: { seat: number; kind: unknown } | null;
  result: EngineResult | null;
};

export type EngineTold = {
  event: { type: string; [key: string]: unknown };
  text: string | null;
  rule: string | null;
};

export type EngineChoice = { action: EngineAction; label: string };

export type EnginePrompt = {
  kind: unknown;
  text: string;
  card: string | null;
  choices: EngineChoice[];
};

export type EngineUpdate = {
  seq: number;
  view: EngineView;
  events: EngineTold[];
  prompt: EnginePrompt | null;
};

/** Le journal d'une partie : de quoi la rejouer à l'identique. */
export type EngineRecord = {
  /**
   * La version du moteur qui a écrit le journal. Le moteur la pose lui-même ;
   * un journal neuf écrit ici, sans action, n'en a pas besoin. Un journal d'une
   * autre version est refusé à la reprise.
   */
  version?: number;
  config: EngineConfig;
  seed: number;
  actions: [number, EngineAction][];
};

export type EngineCard = {
  id: number;
  code: string;
  name: string;
  kind: "unit" | "gear" | "spell" | "rune" | "legend" | "battlefield";
  champion: boolean;
  signature: boolean;
  token: boolean;
  tags: string[];
  domains: string[];
  energy: number;
  power: number;
  might: number;
  text: string;
  coverage: "full" | "none" | { partial: string };
};

/** Rapport d'arbitrage (`joutes-judge`). */
export type JudgeReport = {
  summary: string;
  steps: { player: string; question: string; chose: string }[];
  events: EngineTold[];
  asked:
    | (EnginePrompt & {
        seat: number;
        player: string;
        unplayable: { card: string; name: string; reason: string; rule: string | null }[];
      })
    | null;
  result: EngineResult | null;
  rules: string[];
  notes: string[];
  table: EngineView;
};

export function locIsBase(loc: EngineLoc): loc is { Base: number } {
  return "Base" in loc;
}

export function boardLoc(zone: EngineZone): EngineLoc | null {
  return typeof zone === "object" && "Board" in zone ? zone.Board : null;
}
