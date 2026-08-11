import {Lair} from "@/lib/types/Lair";
import {Game} from "@/lib/types/Game";

export type User = {
  id: string;
  username: string;
  displayName?: string; // Nom d'utilisateur personnalisé (partie avant le #)
  discriminator?: string; // Nombre à 4 chiffres (partie après le #)
  email: string;
  discordId: string;

  avatar?: string;

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
  
  // Informations publiques du profil
  description?: string; // Description du profil
  website?: string; // Site web personnel
  socialLinks?: string[]; // Liens vers les réseaux sociaux
  profileImage?: string; // Image de profil personnalisée (URL Vercel Blob)
  
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
    }
  }
};
