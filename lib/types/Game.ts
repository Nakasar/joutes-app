import { GameTypeKey } from "@/lib/constants/game-types";
import { GameFeatureKey } from "@/lib/constants/game-features";
import { Lair } from "@/lib/types/Lair";

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
  /**
   * Fonctionnalités activées. Les clés et leurs libellés sont décrits une seule
   * fois, dans `lib/constants/game-features.ts` — le formulaire
   * d'administration se rend à partir de cette même table.
   */
  features?: Partial<Record<GameFeatureKey, boolean>>;
};

export type GameType = GameTypeKey;
