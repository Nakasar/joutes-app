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
  images: {
    icon?: string;
    horizontal?: string;
    vertical?: string;
    banner?: string;
  };
  longDescription: string;
  color: string;
  note: { [category: string]: number };
  gallery: string[];
  links: {
    website?: string;
    x?: string;
    discord?: string;
    youtube?: string;
    twitch?: string;
    bluesky?: string;
  } & { [social: string]: string; };
  metadata: {
    publisher?: string;
    releaseDate?: string;
    players?: {
      min: number;
      max?: number;
    };
    playingTimeMinutes?: {
      min: number;
      max?: number;
    };
  };
  formats?: { name: string }[];
  stats: {
    communityRating: number;
    popularityScore: number;
  };
};

export type GameType = GameTypeKey;
