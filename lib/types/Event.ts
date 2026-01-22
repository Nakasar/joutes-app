import { GeoJSONPoint } from "./Lair";

export type Event = {
  id: string;
  lairId?: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  game?: {
    name: string;
    icon?: string;
    banner?: string;
    type: 'TCG' | 'BoardGame' | 'VideoGame' | 'Other';
    slug?: string;
  };
  url?: string;
  price?: number;
  status: 'available' | 'sold-out' | 'cancelled';
  addedBy: string; // "AI-SCRAPPING", "JSON-MAPPING" or "USER"
  creatorId?: string;
  creator?: {
    id: string;
    displayName?: string;
    discriminator?: string;
  };
  runningState?: 'not-started' | 'ongoing' | 'completed';
  allowJoin?: boolean;
  participants?: string[]; // IDs des utilisateurs inscrits à l'événement
  maxParticipants?: number; // Nombre maximum de participants (optionnel)
  favoritedBy?: string[]; // IDs des utilisateurs qui ont mis cet événement en favori
  lair?: {
    id: string;
    name: string;
    location?: GeoJSONPoint;
    address?: string;
    owners?: string[];
  };
};
