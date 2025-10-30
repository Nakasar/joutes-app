import { GameTypeKey } from "@/lib/constants/game-types";

export type Game = {
  id: string;
  name: string;
  icon?: string;
  banner?: string;
  description: string;
  type: GameTypeKey;
};

export type GameType = GameTypeKey;
