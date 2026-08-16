/**
 * Les teintes d'un statut affiché à côté d'un pseudonyme.
 *
 * Table à part de celle des offres, et c'est délibéré : un « Fondateur » en
 * argent se lirait comme un badge Supporter, ce qui annulerait exactement la
 * distinction qu'on cherche entre ce qui s'achète et ce qui se mérite. Un test
 * vérifie d'ailleurs qu'aucune classe de statut ne coïncide avec une classe
 * d'offre.
 *
 * Les classes sont **écrites en toutes lettres** : Tailwind lit le source pour
 * décider quoi générer, et une classe composée n'existerait pas dans la feuille
 * finale.
 */

export const STATUS_TONES = {
  slate: {
    label: "Neutre",
    // Volontairement sans couleur propre, là où les offres en ont toutes une :
    // la première version reprenait la nuance d'ardoise du palier Supporter, et
    // un « Fondateur » neutre s'y lisait comme un abonné. Le test de collision
    // l'a rattrapé — il est là pour ça.
    badge: "bg-foreground/5 text-foreground border-foreground/25",
  },
  gold: {
    label: "Or",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/40",
  },
  crimson: {
    label: "Carmin",
    badge: "bg-rose-600/15 text-rose-800 dark:text-rose-200 border-rose-600/40",
  },
  emerald: {
    label: "Émeraude",
    badge: "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200 border-emerald-600/40",
  },
  sky: {
    label: "Ciel",
    badge: "bg-sky-600/15 text-sky-800 dark:text-sky-200 border-sky-600/40",
  },
} as const;

export type StatusTone = keyof typeof STATUS_TONES;

export const STATUS_TONE_KEYS = Object.keys(STATUS_TONES) as StatusTone[];

export const STATUS_TONE_OPTIONS = Object.entries(STATUS_TONES).map(([value, tone]) => ({
  value: value as StatusTone,
  ...tone,
}));

/** La teinte par défaut : celle d'un statut créé sans en choisir. */
export const DEFAULT_STATUS_TONE: StatusTone = "slate";

export function isStatusTone(tone: string): tone is StatusTone {
  return Object.hasOwn(STATUS_TONES, tone);
}

/**
 * Les classes d'un statut. Une teinte inconnue — écrite à la main, ou héritée
 * d'une version antérieure — retombe sur la teinte neutre plutôt que de rendre
 * `undefined`, qui donnerait un badge sans style au lieu d'une erreur visible.
 */
export function statusBadgeClass(tone: string | undefined): string {
  return STATUS_TONES[tone && isStatusTone(tone) ? tone : DEFAULT_STATUS_TONE].badge;
}
