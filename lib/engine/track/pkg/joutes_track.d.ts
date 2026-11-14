/* tslint:disable */
/* eslint-disable */
/**
 * Les rectangles `[x, y, largeur, hauteur]` où deux images de même taille
 * (pixels RGBA) diffèrent, par cases de `cell` pixels. Une liste vide : rien n'a bougé.
 */
export function frame_changes(before: Uint8Array, after: Uint8Array, width: number, height: number, cell: number, threshold: number): string;
/**
 * Version du moteur.
 */
export function version(): string;
/**
 * La lecture d'une table filmée : les cartes des deux listes, puis des images.
 */
export class TableReader {
  free(): void;
  /**
   * Ajoute une carte à reconnaître, par son image à plat (pixels RGBA).
   * Rend le nombre de points d'intérêt retenus.
   */
  add(id: string, rgba: Uint8Array, width: number, height: number): number;
  /**
   * `options` : JSON, `{ card_min, card_max, zoom, reference, min_points }`
   * (largeurs de carte en pixels de l'image de la caméra), ou `{}`.
   */
  constructor(options: string);
  /**
   * Les cartes visibles dans une image de la caméra (pixels RGBA), ou dans
   * un rectangle de celle-ci (`w` à 0 : l'image entière), sans rien retenir.
   * Rend une liste JSON `[{ id, points, quad: [[x, y] × 4], angle, at, seen, sure }]`,
   * de la plus sûre à la moins sûre.
   */
  read(rgba: Uint8Array, width: number, height: number, x: number, y: number, w: number, h: number): string;
  /**
   * Oublie la table : la prochaine image est lue en entier.
   */
  reset(): void;
  /**
   * Reçoit l'image suivante de la caméra (à intervalle régulier). Chaque
   * endroit qui a changé est relu dès qu'il ne bouge plus. Rend
   * `{ state: "moving" | "still" | "read", areas, found }` : `found` est la
   * table entière après cette image, `areas` les zones relues.
   */
  watch(rgba: Uint8Array, width: number, height: number): string;
  /**
   * Les bornes de largeur d'une carte dans l'image, connues après le
   * calibrage. La table est oubliée : la prochaine image est lue en entier.
   */
  set_card(min: number, max: number): void;
}
/**
 * Le suivi d'une partie.
 */
export class Tracking {
  free(): void;
  /**
   * L'observation que donnent des cartes reconnues dans l'image.
   * `spotted` : liste JSON `[{ card, at: [x, y], angle }]` ; `layout` : les
   * zones tracées au calibrage (`joutes_track::Layout`).
   */
  read_table(spotted: string, layout: string): string;
  /**
   * Le score d'un joueur, saisi par l'arbitre : la caméra ne le voit pas.
   */
  set_points(seat: number, points: number): void;
  /**
   * Après un écart que les joueurs ont réparé : suit la suite permise la plus proche.
   */
  accept_nearest(): string;
  /**
   * `config` : la configuration de la partie (JSON : les deux listes de deck,
   * `first_player`). `battlefields` : les champs de bataille posés sur la
   * table (liste JSON de codes, dans l'ordre où la partie les range ; vide,
   * le moteur les tire).
   */
  constructor(config: string, battlefields: string, seed: number);
  /**
   * « La table a raison » : met le suivi en accord avec l'observation sans
   * passer par les règles. Rend ce qui a été corrigé (liste de phrases).
   */
  force(observation: string): string;
  /**
   * Le nombre d'actions retenues depuis le début.
   */
  steps(): number;
  /**
   * La table que le suivi croit vraie, vue par un arbitre (`View`).
   */
  table(): string;
  /**
   * Retient l'une des explications de la dernière observation ambiguë.
   */
  choose(index: number): string;
  /**
   * Confronte une observation (JSON, voir `docs/suivi.md`) à la partie suivie.
   * Rend `{ outcome: "unchanged" | "explained" | "ambiguous" | "deviation", … }`.
   */
  observe(observation: string): string;
  /**
   * La même, sous la forme d'une observation.
   */
  expected(): string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_tablereader_free: (a: number, b: number) => void;
  readonly __wbg_tracking_free: (a: number, b: number) => void;
  readonly frame_changes: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number, number];
  readonly tablereader_add: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
  readonly tablereader_new: (a: number, b: number) => [number, number, number];
  readonly tablereader_read: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
  readonly tablereader_reset: (a: number) => void;
  readonly tablereader_set_card: (a: number, b: number, c: number) => void;
  readonly tablereader_watch: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly tracking_accept_nearest: (a: number) => [number, number, number, number];
  readonly tracking_choose: (a: number, b: number) => [number, number, number, number];
  readonly tracking_expected: (a: number) => [number, number];
  readonly tracking_force: (a: number, b: number, c: number) => [number, number, number, number];
  readonly tracking_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly tracking_observe: (a: number, b: number, c: number) => [number, number, number, number];
  readonly tracking_read_table: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
  readonly tracking_set_points: (a: number, b: number, c: number) => [number, number];
  readonly tracking_steps: (a: number) => number;
  readonly tracking_table: (a: number) => [number, number];
  readonly version: () => [number, number];
  readonly __wbindgen_export_0: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
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
