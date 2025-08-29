export type Game = {
  id: string;
  name: string;
  icon: string;
  banner: string;
  description: string;
  type: GameType;
};

export type GameType = 'TCG' | 'BoardGame';
