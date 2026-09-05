/**
 * Ce que l'accueil regarde, et combien il en montre.
 *
 * Partagé par la page (`app/[locale]/(app)/_accueil/`) et par `GET /feed`,
 * qui sert la même composition à l'application mobile : les deux doivent
 * compter pareil, sinon le téléphone et le site ne montreraient pas le même
 * accueil.
 */

/** La fenêtre que l'accueil regarde : d'aujourd'hui à sept jours. */
export const JOURS_A_VENIR = 7;

/** Ce qu'une tuile montre au plus, avant de renvoyer vers sa page. */
export const MAX_EVENEMENTS = 3;
export const MAX_LIEUX = 3;
export const MAX_DECKS = 3;
export const MAX_FIL = 6;

/** Ce qu'un client peut demander de plus au fil, sans le laisser tout lire. */
export const MAX_FIL_API = 20;

/** Rayon par défaut d'une recherche « autour de moi », comme au calendrier. */
export const RAYON_DEFAUT_KM = 15;

/** Ce que la barre des jeux propose quand on ne sait rien des goûts du visiteur. */
export const JEUX_PAR_DEFAUT = ["riftbound", "mtg", "swu"];

export type FeedEntryType = "news" | "content" | "deck" | "social";

/**
 * Ce qu'une source au plus peut prendre dans le fil « Tout ».
 *
 * Les publications rapatriées des réseaux d'un éditeur arrivent plusieurs
 * fois par jour ; sans plafond, un tri par date seul leur donnerait toutes
 * les places. Voir `lib/content/feed-mix.ts`.
 */
export const PLAFONDS_FIL: Partial<Record<FeedEntryType, number>> = { social: 2 };
