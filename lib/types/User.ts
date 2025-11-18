import {Lair} from "@/lib/types/Lair";
import {Game} from "@/lib/types/Game";

export type User = {
  id: string;
  username: string;
  displayName?: string; // Nom d'utilisateur personnalisé (partie avant le #)
  discriminator?: string; // Nombre à 4 chiffres (partie après le #)
  email: string;
  discordId: string;

  avatar: string;

  lairs: Lair['id'][];
  games: Game['id'][];
  
  isPublicProfile?: boolean; // Si true, le profil affiche les jeux et lieux de l'utilisateur
};
