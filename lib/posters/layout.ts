/**
 * Ce que la page peut porter, et à quelle échelle.
 *
 * Le calcul est séparé du dessin parce qu'il se vérifie : c'est de
 * l'arithmétique sur des hauteurs, et elle décide de ce qu'une affiche montre.
 * Le dessin, lui, ne fait qu'appliquer l'échelle qu'on lui rend
 * (`lib/posters/image.tsx`).
 *
 * Les hauteurs sont **estimées**, non mesurées : satori mesure le texte au
 * rendu, et nous n'avons pas ce chiffre au moment de décider. Elles viennent
 * donc du rendu observé, avec une réserve — voir `HEIGHT_SAFETY`.
 */

import type { PosterEvent } from "@/lib/posters/format";
import type { PosterVenue } from "@/lib/posters/selection";

/**
 * Ce qui reste au corps de l'affiche, une fois l'en-tête et le pied posés.
 *
 * Les hauteurs sont mesurées sur le rendu, et l'en-tête se calcule plutôt
 * qu'il ne se suppose : un nom de lieu qui se replie sur deux lignes prend une
 * cinquantaine de pixels au corps, et une constante prudente les retirerait
 * même aux lieux dont le nom tient sur une ligne. Trop bas, l'affiche se serre
 * pour rien ; trop haut, elle déborde — et ce qui déborde d'une image postée
 * dans un fil est perdu sans que personne le sache.
 *
 * Le repli du nom s'estime au nombre de caractères : satori mesure le texte,
 * pas nous, et une estimation à une ligne près suffit à décider d'une échelle.
 */
const PAGE_HEIGHT = 1123;
const PAGE_PADDING = 82;
const FOOTER_HEIGHT = 156;
const BODY_MARGIN = 18;
const HEADER_BASE = 94;
const HEADER_NAME_LINE = 48;
const HEADER_ADDRESS = 29;
const NAME_CHARS_PER_LINE = 28;

/**
 * La marge d'erreur du calcul ci-dessus.
 *
 * Les hauteurs sont estimées, pas mesurées : une vingtaine de pixels de
 * réserve valent mieux qu'une dernière carte rognée d'un cheveu, et coûtent au
 * pire un événement de moins sur une semaine déjà pleine.
 */
const HEIGHT_SAFETY = 20;

export function posterBodyHeight(venue: PosterVenue): number {
  const lines = Math.max(1, Math.ceil(venue.name.length / NAME_CHARS_PER_LINE));
  const header = HEADER_BASE + lines * HEADER_NAME_LINE + (venue.address ? HEADER_ADDRESS : 0);

  return PAGE_HEIGHT - PAGE_PADDING - FOOTER_HEIGHT - BODY_MARGIN - HEIGHT_SAFETY - header;
}

/** La hauteur d'une ligne d'événement, à l'échelle 1 : son nom et sa ligne de détails. */
const EVENT_HEIGHT = 48;

/** Ce qu'une carte de jour ou de semaine coûte avant son premier événement. */
const GROUP_HEIGHT = 34;

/** Le libellé d'une semaine, sur l'affiche mensuelle. */
const GROUP_TITLE_HEIGHT = 24;

/**
 * En dessous, l'affiche cesse de rétrécir et se met à couper.
 *
 * Une A4 imprimée déborde en silence — la page coupe, et le gérant le voit à
 * l'aperçu. Une image n'a pas d'aperçu : elle rétrécit jusqu'à ce que le texte
 * reste lisible, puis compte ce qu'elle ne montre pas.
 */
const MIN_SCALE = 0.72;

/** Une carte de l'affiche : un jour de la semaine, ou une semaine du mois. */
export type PosterGroup = { titled: boolean; events: PosterEvent[] };

export type PosterPlan = {
  /** De combien tout rétrécit pour tenir sur la page. */
  scale: number;
  /** Les événements gardés, carte par carte. */
  kept: PosterEvent[][];
  /** Ceux qui ne tiennent pas, et que l'affiche annonce sans les écrire. */
  hidden: number;
};

/**
 * Ce que la page peut porter, et à quelle échelle.
 *
 * La hauteur est linéaire en l'échelle — tout y est proportionnel —, si bien
 * que l'échelle juste se lit d'une division plutôt que d'une table de seuils.
 * Elle s'arrête à `MIN_SCALE` : passé ce point, réduire encore rendrait
 * l'affiche illisible, et il vaut mieux annoncer ce qui manque.
 */
export function planPosterBody(groups: PosterGroup[], available: number): PosterPlan {
  const height = (group: PosterGroup, events: number) =>
    GROUP_HEIGHT + (group.titled ? GROUP_TITLE_HEIGHT : 0) + events * EVENT_HEIGHT;

  const base = groups.reduce((total, group) => total + height(group, group.events.length), 0);
  const scale = base > 0 ? Math.min(1, Math.max(MIN_SCALE, available / base)) : 1;

  if (base * scale <= available) {
    return { scale, kept: groups.map((group) => group.events), hidden: 0 };
  }

  // La place restante se compte à l'échelle 1, comme les hauteurs ci-dessus :
  // une carte qui ne tient plus laisse la suivante essayer, car une semaine
  // chargée ne doit pas faire disparaître la fin du mois.
  let room = available / scale;
  const kept: PosterEvent[][] = [];
  let hidden = 0;

  for (const group of groups) {
    const overhead = height(group, 0);
    const fits = room > overhead ? Math.floor((room - overhead) / EVENT_HEIGHT) : 0;
    const taken = Math.min(fits, group.events.length);

    kept.push(group.events.slice(0, taken));
    hidden += group.events.length - taken;

    if (taken > 0) {
      room -= height(group, taken);
    }
  }

  return { scale, kept, hidden };
}
