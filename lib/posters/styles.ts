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

/**
 * La signature du pied d'affiche, à la place du bloc Joutes — Joutes Pro.
 *
 * Chaque champ est indépendant : un lieu qui ne pose que son logo garde le
 * nom et la ligne de Joutes sous celui-ci. Ce qui n'est pas renseigné reste
 * ce que le style écrit.
 */
export type PosterBranding = {
  /** L'image ronde, à la place de l'emblème Joutes. */
  logo?: string;
  title?: string;
  text?: string;
};

/**
 * L'appel à l'action et le QR code — Joutes Pro.
 *
 * `url` est ce que le QR code encode, et l'adresse écrite sous lui : la page
 * du lieu sur Joutes par défaut, la billetterie ou le site du lieu s'il en
 * décide autrement.
 */
export type PosterCallToAction = {
  title?: string;
  text?: string;
  url?: string;
};

/** Ce que le lieu règle, et que la base conserve sous `options.poster`. */
export type LairPosterSettings = {
  style?: PosterStyleKey;
  /** Les places restantes et la mention « complet ». */
  showAttendance?: boolean;
  /** Les logos des jeux — le nom prend le relais quand un jeu n'en a pas. */
  gameLogos?: boolean;
  branding?: PosterBranding;
  cta?: PosterCallToAction;
};

/**
 * Les mêmes réglages, résolus : plus rien de facultatif.
 *
 * Sauf la signature et l'appel à l'action, qui restent partiels — un champ
 * vide n'y vaut pas « rien », il vaut « ce que le style écrit », et cette
 * décision-là appartient au rendu, qui seul connaît les textes du style.
 */
export type PosterOptions = {
  style: PosterStyleKey;
  showAttendance: boolean;
  gameLogos: boolean;
  branding: PosterBranding;
  cta: PosterCallToAction;
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
 * Le texte s'il en est un, `undefined` sinon.
 *
 * Une chaîne vide traverse la base comme l'URL de l'aperçu : elle vaut « rien
 * de renseigné », donc le texte du style, et non un pied d'affiche muet.
 */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Un champ de la personnalisation : celui que l'aperçu demande, sinon celui de
 * la base.
 *
 * Un champ **présent mais vide** dans la demande vaut « vidé », et non « pas
 * demandé » : sans quoi l'aperçu de l'écran de gestion ne saurait pas montrer
 * un champ qu'on vient d'effacer — il ressortirait ce qui est encore
 * enregistré, jusqu'à la sauvegarde.
 */
function field(asked: unknown, stored: unknown): string | undefined {
  return asked === undefined ? text(stored) : text(asked);
}

/**
 * La personnalisation du pied d'affiche, réservée aux lieux Pro.
 *
 * Un lieu qui ne l'est plus retombe sur la signature Joutes, exactement comme
 * un style Pro retombe sur le style par défaut : l'affiche déjà partagée reste
 * lisible, et les réglages, eux, restent en base pour le jour où
 * l'abonnement reprend.
 */
function readBranding(stored: PosterBranding | undefined, overrides: unknown, isPro: boolean): PosterBranding {
  if (!isPro) {
    return {};
  }

  const asked = (overrides ?? {}) as PosterBranding;

  return {
    logo: field(asked.logo, stored?.logo),
    title: field(asked.title, stored?.title),
    text: field(asked.text, stored?.text),
  };
}

function readCallToAction(stored: PosterCallToAction | undefined, overrides: unknown, isPro: boolean): PosterCallToAction {
  if (!isPro) {
    return {};
  }

  const asked = (overrides ?? {}) as PosterCallToAction;

  return {
    title: field(asked.title, stored?.title),
    text: field(asked.text, stored?.text),
    url: field(asked.url, stored?.url),
  };
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
    branding: readBranding(stored.branding, overrides.branding, isPro),
    cta: readCallToAction(stored.cta, overrides.cta, isPro),
  };
}
