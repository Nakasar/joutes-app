import { GameTypeKey } from "@/lib/constants/game-types";
import { GameFeatureKey } from "@/lib/constants/game-features";
import { Lair } from "@/lib/types/Lair";
import type { GameTournamentDefaults } from "@/lib/tournaments/game-defaults";
import type { GameDeckBuilder } from "@/lib/decks/zones";

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
  /**
   * Le site de l'éditeur et ses réseaux, saisis depuis `/admin/games`.
   *
   * Les clés connues sont décrites une seule fois, dans
   * `lib/constants/game-links.ts` — le formulaire d'administration et la fiche
   * publique se rendent tous deux à partir de cette table. La signature
   * d'index reste : une clé posée à la main en base survit à un
   * enregistrement, elle est seulement laissée hors du formulaire.
   *
   * `youtube` fait en plus autre chose qu'un lien : c'est la chaîne que le cron
   * horaire interroge pour savoir si l'éditeur diffuse. Voir
   * `docs/GAME_LIVES.md`.
   */
  links: {
    website?: string;
    x?: string;
    discord?: string;
    youtube?: string;
    twitch?: string;
    bluesky?: string;
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    reddit?: string;
  } & { [social: string]: string | undefined; };
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
  /**
   * Réglages de tournoi par défaut : preset de statistiques appliqué d'office,
   * départages, scénarios proposés, barème. Décrits et résolus dans
   * `lib/tournaments/game-defaults.ts`. Absent = le jeu s'en tient aux presets
   * livrés avec la plateforme.
   */
  tournamentDefaults?: GameTournamentDefaults;
  /**
   * Réglages du deck builder : les sections d'un deck, leurs bornes, et ce qui
   * vaut pour le deck entier. Décrits et résolus dans `lib/decks/zones.ts`.
   * Absent = le jeu suit les zones livrées avec la plateforme.
   */
  deckBuilder?: GameDeckBuilder;
  /**
   * Édition du jeu en cours, pour les gammes qui en traversent plusieurs — la
   * valeur que porte l'attribut `edition` des produits qui se jouent
   * aujourd'hui. C'est elle que les catalogues montrent par défaut ; absente,
   * ils montrent tout. Réglée depuis `/admin/products`, décrite dans
   * `lib/constants/product-editions.ts`.
   */
  currentProductEdition?: string;
  /**
   * Types de boosters proposés à la saisie d'un booster, dans l'ordre
   * d'affichage, réglés depuis `/admin/games`. `other` n'y figure pas : il est
   * toujours proposé en dernier. Absent = le jeu suit la liste livrée avec la
   * plateforme, décrite dans `lib/constants/booster-types.ts`.
   */
  boosterTypes?: GameBoosterType[];
};

/**
 * Un type de booster d'un jeu. `key` est la valeur stockée sur les boosters ;
 * `label`, facultatif, remplace le libellé traduit des types connus et nomme
 * ceux que l'application ne connaît pas.
 */
export type GameBoosterType = {
  key: string;
  label?: string;
};

export type GameType = GameTypeKey;
