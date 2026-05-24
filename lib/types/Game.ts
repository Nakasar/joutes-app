import { GameTypeKey } from "@/lib/constants/game-types";
import { Lair } from "@/lib/types/Lair";
import {ObjectId} from "mongodb";

export type Game = {
  id: string;
  name: string;
  slug?: string;
  icon?: string;
  banner?: string;
  description: string;
  type: GameTypeKey;
  featuredLairs?: Lair['id'][]; // Lieux mis en avant pour ce jeu
};

export type GameDb = Game & { _id: ObjectId };

export type GameType = GameTypeKey;
