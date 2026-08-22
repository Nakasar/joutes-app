import {Lair} from "@/lib/types/Lair";
import {Game} from "@/lib/types/Game";
import {CardPricePreference} from "@/lib/types/card-price";
import type {UserShowcaseSectionState} from "@/lib/users/showcase";

/**
 * Un lien de la vitrine.
 *
 * L'icône n'est pas stockée : elle se déduit du domaine (`lib/users/links.ts`).
 * Un choix à faire de plus serait un choix à se tromper, et un lien dont
 * l'icône ment est pire qu'un globe.
 */
export type UserShowcaseLink = {
  url: string;
  label?: string;
};

/**
 * Ce qu'un compte règle lui-même sur sa vitrine.
 *
 * Rassemblé dans un sous-objet, comme `lair.options`, plutôt qu'éparpillé à
 * plat sur le document : better-auth écrit aussi dans celui-ci, et une surface
 * nommée dit sans ambiguïté ce que le formulaire de personnalisation a le droit
 * de réécrire.
 *
 * **Ce qui n'y figure pas est délibéré.** Le contour de l'avatar et les badges
 * se dérivent du palier d'abonnement et des statuts posés par l'équipe
 * (`lib/subscriptions/tone.ts`, `lib/achievements/status.ts`) : l'identité d'un
 * profil n'est pas peinte par son propriétaire.
 */
export type UserShowcase = {
  /** URL Vercel Blob. Demande le droit `sub:profile-banner`. */
  banner?: string;
  /**
   * L'ordre et l'activation des blocs. Une liste partielle est admise :
   * `readUserShowcaseSections` complète avec les clés manquantes, à leur place
   * par défaut.
   */
  sections?: UserShowcaseSectionState[];
  /** Un seul deck épinglé à la fois — re-cliquer le désépingle. */
  pinnedDeckId?: string;
  /** Dix au plus. */
  links?: UserShowcaseLink[];
  /**
   * La ville n'apparaît que si on le demande. Absent vaut « non » : une
   * position renseignée pour trouver des lieux proches n'est pas une adresse
   * qu'on a accepté de publier.
   */
  showCity?: boolean;
  /** Pastilles libres du bloc « À propos » — « commander », « draft »… */
  playStyles?: string[];
};

export type User = {
  id: string;
  username: string;
  displayName?: string; // Nom d'utilisateur personnalisé (partie avant le #)
  discriminator?: string; // Nombre à 4 chiffres (partie après le #)
  email: string;
  discordId: string;

  avatar?: string;

  /**
   * Quand le compte a été créé. ISO 8601, écrit par better-auth à
   * l'inscription — c'est lui qui porte le « membre depuis » de la vitrine.
   */
  createdAt?: string;

  lairs: Lair['id'][];
  games: Game['id'][];
  /**
   * Jeux mis en avant **parmi ceux que l'utilisateur suit** : ce sont eux que
   * le menu « Jeux » propose. Toujours un sous-ensemble de `games` — retirer un
   * jeu des suivis le retire aussi d'ici (`removeGameFromUser`), et la lecture
   * écarte de toute façon un favori qui n'y figure plus
   * (`lib/games/nav-menu.ts`) : un favori n'a de sens que parmi les jeux suivis.
   */
  favoriteGames?: Game['id'][];
  friends: User['id'][];
  friendCode?: string; // Code unique partageable (QR code) pour être ajouté en ami instantanément

  isPublicProfile?: boolean; // Si true, le profil affiche les jeux et lieux de l'utilisateur

  /**
   * Le fournisseur dont les prix représentent les cartes, à l'écran, pour ce
   * joueur-là. Absent, c'est la plateforme qui choisit — cf.
   * `lib/types/card-price.ts` et docs/CARD_PRICES.md.
   */
  pricePreference?: CardPricePreference;


  // Informations publiques du profil
  description?: string; // Description du profil
  website?: string; // Site web personnel
  socialLinks?: string[]; // Liens vers les réseaux sociaux
  profileImage?: string; // Image de profil personnalisée (URL Vercel Blob)

  /** Ce que le compte règle sur sa vitrine publique. */
  showcase?: UserShowcase;
  
  // Localisation par défaut de l'utilisateur
  location?: {
    latitude: number;
    longitude: number;
    /**
     * Localité d'où viennent ces coordonnées, telle qu'elle a été choisie :
     * « Lyon (69000), France ». Absente d'une position relevée au GPS ou saisie
     * en coordonnées, qui ne se rattachent à aucune ville nommée — l'affichage
     * retombe alors sur les coordonnées elles-mêmes.
     */
    label?: string;
    city?: string;
    postalCode?: string;
  };
  notifications?: {
    emails?: {
      weekly?: {
        enabled: boolean;
        lastSent?: string | null;
      },
      platform?: {
        enabled: boolean;
        lastSent?: string | null;
      },
    };
    app?: {
      weekly?: {
        enabled: boolean;
        lastSent?: string | null;
      },
      /**
       * Interrupteur général des notifications push transactionnelles.
       *
       * Absent vaut activé : enregistrer un appareil le pose à `true` au moment
       * où l'utilisateur accepte l'invite du système, et un compte sans
       * appareil n'a de toute façon rien à recevoir. L'interrupteur sert à
       * couper.
       */
      push?: {
        enabled: boolean;
      },
    }
  }
};
