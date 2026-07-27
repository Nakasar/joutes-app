import type { CubeDrawConfig } from "@/lib/types/Cube";

/**
 * Tirage appliqué aux cubes dont le propriétaire n'a rien configuré : un paquet
 * par joueur, sans doublon. Tout cube reste ainsi jouable dès qu'il contient un
 * paquet, plutôt que d'exiger une configuration avant la première partie.
 */
export const DEFAULT_CUBE_DRAW: CubeDrawConfig = {
  mode: "packs",
  packsPerPlayer: 1,
  cardsPerPlayer: 15,
  rules: [],
  allowDuplicates: false,
};

export const CUBE_DRAW_MAX_PACKS_PER_PLAYER = 20;
export const CUBE_DRAW_MAX_CARDS_PER_PLAYER = 200;
export const CUBE_DRAW_MAX_RULES = 12;

/** Bornes du nombre de joueurs d'un tirage, côté saisie comme côté serveur. */
export const CUBE_DRAW_MIN_PLAYERS = 1;
export const CUBE_DRAW_MAX_PLAYERS = 16;
