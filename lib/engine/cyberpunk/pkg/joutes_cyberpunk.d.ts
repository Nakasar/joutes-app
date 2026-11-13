/* tslint:disable */
/* eslint-disable */
/**
 * Version du moteur.
 */
export function version(): string;
/**
 * Toutes les cartes de Cyberpunk TCG connues du moteur, avec leur niveau de prise en charge.
 */
export function cp_catalog(): string;
/**
 * Les problèmes d'un deck Cyberpunk construit (liste vide s'il est valide).
 */
export function cp_validate_deck(deck_json: string): string;
/**
 * Un deck valide de 40 cartes construit au hasard autour de trois Légendes
 * (une liste JSON de codes, « WNC-001 »), ou `null`.
 */
export function cp_auto_deck(legends_json: string, seed: number): string;
/**
 * Une configuration complète avec deux decks au hasard.
 */
export function cp_random_config(seed: number): string;
/**
 * Joue une partie entière entre robots, comme [`simulate`]. Le « score » du
 * résumé est le nombre de Gigs de chacun.
 */
export function cp_simulate(config: string, seed: number, bots: string): string;
/**
 * Arbitrage : construit la situation décrite (JSON, voir
 * `joutes_judge::cyberpunk::Scenario`), y déroule les choix (`steps` : liste
 * JSON d'indices) et rend le rapport.
 */
export function cp_judge_simulate(scenario: string, steps: string): string;
/**
 * Arbitrage d'une vraie partie : rejoue son journal jusqu'à l'action `upto`
 * (-1 = jusqu'au bout) et raconte les `last` dernières actions.
 */
export function cp_judge_review(record: string, upto: number, last: number): string;
/**
 * Une partie de Cyberpunk TCG tenue dans le navigateur : les mêmes appels
 * que [`Table`], avec la configuration, les actions et la vue de Cyberpunk.
 */
export class CyberpunkTable {
  free(): void;
  /**
   * Joue l'action d'un humain. Rend le numéro du premier évènement nouveau.
   */
  act(seat: number, action: string): number;
  /**
   * `config` : la configuration (JSON, deux joueurs). `bots` : un niveau par
   * siège (`"easy"`, `"normal"`, `"hard"`) ou `null` pour un humain.
   */
  constructor(config: string, seed: number, bots: string);
  seq(): number;
  is_bot(seat: number): boolean;
  /**
   * Le journal complet : configuration, graine et actions.
   */
  record(): string;
  /**
   * Le résultat (JSON) ou `null` si la partie continue.
   */
  result(): string;
  /**
   * Le siège qui doit décider, ou -1.
   */
  to_act(): number;
  /**
   * La table vue d'un siège (0, 1), d'un spectateur (-1) ou d'un arbitre (-2),
   * avec les évènements depuis `since`.
   */
  update(seat: number, since: number): string;
  /**
   * Rouvre une partie depuis son journal (`record()`).
   */
  static restore(record: string, bots: string): CyberpunkTable;
  /**
   * Fait jouer un coup au robot dont c'est le tour. Rend -1 si personne ne joue.
   */
  bot_step(): number;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly version: () => [number, number];
  readonly __wbg_cyberpunktable_free: (a: number, b: number) => void;
  readonly cp_auto_deck: (a: number, b: number, c: number) => [number, number, number, number];
  readonly cp_catalog: () => [number, number];
  readonly cp_judge_review: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly cp_judge_simulate: (a: number, b: number, c: number, d: number) => [number, number, number, number];
  readonly cp_random_config: (a: number) => [number, number, number, number];
  readonly cp_simulate: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly cp_validate_deck: (a: number, b: number) => [number, number, number, number];
  readonly cyberpunktable_act: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly cyberpunktable_bot_step: (a: number) => number;
  readonly cyberpunktable_is_bot: (a: number, b: number) => number;
  readonly cyberpunktable_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly cyberpunktable_record: (a: number) => [number, number];
  readonly cyberpunktable_restore: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly cyberpunktable_result: (a: number) => [number, number];
  readonly cyberpunktable_seq: (a: number) => number;
  readonly cyberpunktable_to_act: (a: number) => number;
  readonly cyberpunktable_update: (a: number, b: number, c: number) => [number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
