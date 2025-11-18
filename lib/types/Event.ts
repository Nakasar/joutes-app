import { GeoJSONPoint } from "./Lair";

export type Event = {
  id: string;
  lairId?: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  url?: string;
  price?: number;
  status: 'available' | 'sold-out' | 'cancelled';
  addedBy: string; // ID de l'utilisateur qui a créé l'événement ou "AI-SCRAPPING"
  addedByDetails?: {
    id: string;
    displayName?: string;
    discriminator?: string;
  };
  participants?: string[]; // IDs des utilisateurs inscrits à l'événement
  maxParticipants?: number; // Nombre maximum de participants (optionnel)
  lair?: {
    id: string;
    name: string;
    location?: GeoJSONPoint;
    address?: string;
  };
};
