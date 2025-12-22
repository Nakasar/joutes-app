export const GAME_TYPES = {
  TCG: "TCG",
  BoardGame: "Jeu de Plateau",
  VideoGame: "Jeu Vidéo",
  Other: "Autre",
} as const;

export type GameTypeKey = keyof typeof GAME_TYPES;

export const GAME_TYPE_OPTIONS = Object.entries(GAME_TYPES).map(([value, label]) => ({
  value,
  label,
}));
