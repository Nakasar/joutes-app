/**
 * La sélection que porte une affiche libre : des lieux, et des jeux.
 *
 * L'affiche d'un lieu tient son sujet de son adresse — un identifiant dans le
 * chemin, et tout le reste en découle. Celle qu'un joueur compose n'a pas de
 * sujet : elle en a plusieurs, choisis, et transportés par la requête. Ce
 * module lit cette requête et en fait le bloc d'identité de l'affiche.
 *
 * Tout y est pur : la lecture des identifiants, leur plafond, la façon de
 * nommer une réunion de lieux. Ce qui touche à la base ou aux droits vit dans
 * la page.
 */

/**
 * Le nombre de lieux qu'une affiche accepte.
 *
 * Une A4 ne tient pas la semaine de vingt boutiques, et chaque lieu est une
 * lecture de plus : la borne protège autant la page que le serveur. Elle est
 * volontairement large — huit lieux, c'est déjà une association de quartier
 * entière — plutôt que serrée sur ce qu'on imagine du besoin.
 */
export const MAX_POSTER_LAIRS = 8;

/** Le nombre de jeux qu'une affiche accepte comme filtre. */
export const MAX_POSTER_GAMES = 20;

/** Au-delà, la ligne des lieux compte au lieu d'énumérer. */
const VENUE_NAMES_SHOWN = 3;

/** Un identifiant Mongo, et rien d'autre. */
const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * Les identifiants portés par un paramètre `a,b,c`.
 *
 * Le filtre sur la forme n'est pas une politesse : `new ObjectId("bonjour")`
 * **lève**, et une adresse bricolée à la main rendrait 500 — « le serveur est
 * en panne » — là où la bonne réponse est de n'en rien faire. Les doublons
 * tombent, l'ordre de la requête est gardé, et le plafond s'applique en
 * dernier.
 */
export function readLairIds(value: string | undefined, max: number = MAX_POSTER_LAIRS): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();

  for (const raw of value.split(",")) {
    const id = raw.trim();

    if (OBJECT_ID.test(id)) {
      seen.add(id.toLowerCase());
    }

    if (seen.size >= max) {
      break;
    }
  }

  return [...seen];
}

/**
 * Les jeux portés par un paramètre `a,b,c`.
 *
 * Un jeu se désigne par son identifiant ou par sa limace, et les deux
 * traversent l'URL : le filtre n'est donc que sur ce qui pourrait blesser —
 * la longueur, et les caractères d'une adresse. Le rapprochement avec les
 * jeux réels se fait plus loin, sur le nom que porte l'événement.
 */
export function readGameKeys(value: string | undefined, max: number = MAX_POSTER_GAMES): string[] {
  if (!value) {
    return [];
  }

  const seen = new Set<string>();

  for (const raw of value.split(",")) {
    const key = raw.trim();

    if (key.length > 0 && key.length <= 80 && /^[A-Za-z0-9_-]+$/.test(key)) {
      seen.add(key);
    }

    if (seen.size >= max) {
      break;
    }
  }

  return [...seen];
}

/** Le bloc d'identité en tête d'affiche : un nom, et une ligne sous lui. */
export type PosterVenue = {
  name: string;
  address?: string;
};

export type PosterVenueStrings = {
  /** « 3 lieux » */
  venues: (count: number) => string;
  /** « +2 » */
  more: (count: number) => string;
};

/**
 * Le sujet de l'affiche, tel que l'en-tête l'écrit.
 *
 * Un seul lieu se présente comme sa propre affiche le ferait — son nom, son
 * adresse — et c'est ce qui garantit qu'une affiche composée d'un lieu unique
 * ne se distingue en rien de celle que ce lieu publie lui-même.
 *
 * Plusieurs lieux n'ont ni nom ni adresse communs : le titre les compte, et la
 * ligne du dessous les nomme. Passé trois noms, elle en garde trois et compte
 * le reste — une A4 n'a pas de place pour huit raisons sociales, et une ligne
 * qui déborde vaut moins qu'une ligne qui dit « +5 ».
 */
export function posterVenue(lairs: PosterVenue[], strings: PosterVenueStrings): PosterVenue {
  if (lairs.length === 1) {
    return { name: lairs[0].name, address: lairs[0].address };
  }

  const shown = lairs.slice(0, VENUE_NAMES_SHOWN).map((lair) => lair.name);
  const hidden = lairs.length - shown.length;

  return {
    name: strings.venues(lairs.length),
    address: [...shown, ...(hidden > 0 ? [strings.more(hidden)] : [])].join(" · ") || undefined,
  };
}
