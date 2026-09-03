import type { Lair } from "@/lib/types/Lair";

/**
 * Les styles de l'affiche des événements.
 *
 * Sept habillages pour la même page A4 : les trois premiers sont ouverts à
 * tous les lieux, les quatre suivants demandent Joutes Pro. La clé est ce que
 * la base stocke et ce que l'URL de l'affiche transporte ; le nom lisible vit
 * dans les messages (`Lairs.poster.styles.<clé>.name`).
 *
 * Les trois couleurs sont l'aperçu du sélecteur de l'écran de gestion — ce
 * qu'un gérant voit avant d'ouvrir l'affiche —, pas des jetons de rendu : le
 * rendu lui-même vit dans `components/posters/poster.css`.
 */
export const POSTER_STYLE_KEYS = [
  "joutes",
  "board",
  "tournament",
  "cyberpunk",
  "tavern",
  "scifi",
  "grimoire",
] as const;

export type PosterStyleKey = (typeof POSTER_STYLE_KEYS)[number];

export const POSTER_STYLES: Record<PosterStyleKey, { pro: boolean; swatches: [string, string, string] }> = {
  joutes: { pro: false, swatches: ["#0a0a0a", "#9333ea", "#fafafa"] },
  board: { pro: false, swatches: ["#a97a4e", "#fff59a", "#c6e6ff"] },
  tournament: { pro: false, swatches: ["#eadfc0", "#8b1e2d", "#1f3a6b"] },
  cyberpunk: { pro: true, swatches: ["#05070f", "#00e5ff", "#ff2bd6"] },
  tavern: { pro: true, swatches: ["#3a2414", "#f2cf7a", "#f1e3c3"] },
  scifi: { pro: true, swatches: ["#e3edf7", "#0f2f52", "#0ea5e9"] },
  grimoire: { pro: true, swatches: ["#2b1a10", "#e2d2ab", "#8a2a1f"] },
};

export const DEFAULT_POSTER_STYLE: PosterStyleKey = "joutes";

export const POSTER_PERIODS = ["week", "month"] as const;

export type PosterPeriod = (typeof POSTER_PERIODS)[number];

/** Ce que le lieu règle, et que la base conserve sous `options.poster`. */
export type LairPosterSettings = {
  style?: PosterStyleKey;
  /** Les places restantes et la mention « complet ». */
  showAttendance?: boolean;
  /** Les logos des jeux — le nom prend le relais quand un jeu n'en a pas. */
  gameLogos?: boolean;
};

/** Les mêmes réglages, résolus : plus rien de facultatif. */
export type PosterOptions = {
  style: PosterStyleKey;
  showAttendance: boolean;
  gameLogos: boolean;
};

export function isPosterStyleKey(value: unknown): value is PosterStyleKey {
  return typeof value === "string" && (POSTER_STYLE_KEYS as readonly string[]).includes(value);
}

export function isPosterPeriod(value: unknown): value is PosterPeriod {
  return typeof value === "string" && (POSTER_PERIODS as readonly string[]).includes(value);
}

/**
 * Le style que l'affiche rend vraiment.
 *
 * Un style Pro demandé par un lieu qui ne l'est pas — ou plus — retombe sur
 * le style par défaut plutôt que d'échouer : un abonnement arrêté ne doit pas
 * casser une affiche déjà partagée, ni forcer le gérant à revenir régler quoi
 * que ce soit pour imprimer la sienne.
 */
export function resolvePosterStyle(requested: unknown, isPro: boolean): PosterStyleKey {
  if (!isPosterStyleKey(requested)) {
    return DEFAULT_POSTER_STYLE;
  }

  return POSTER_STYLES[requested].pro && !isPro ? DEFAULT_POSTER_STYLE : requested;
}

/**
 * Les réglages du lieu, complétés de leurs valeurs par défaut.
 *
 * `overrides` porte ce qu'une URL demande par-dessus les réglages
 * enregistrés : c'est ainsi que l'aperçu de l'écran de gestion montre un
 * réglage avant qu'il soit sauvegardé. Le contrôle Pro s'applique aux deux.
 */
export function readPosterOptions(
  lair: Pick<Lair, "options">,
  isPro: boolean,
  overrides: Partial<Record<keyof PosterOptions, unknown>> = {},
): PosterOptions {
  const stored = lair.options?.poster ?? {};

  const bool = (override: unknown, fallback: boolean | undefined): boolean => {
    if (override === "1" || override === true) return true;
    if (override === "0" || override === false) return false;
    return fallback ?? true;
  };

  return {
    style: resolvePosterStyle(overrides.style ?? stored.style, isPro),
    showAttendance: bool(overrides.showAttendance, stored.showAttendance),
    gameLogos: bool(overrides.gameLogos, stored.gameLogos),
  };
}
