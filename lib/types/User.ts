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
