import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";

// Type GeoJSON Point pour MongoDB
export type GeoJSONPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

// Type pour le mapping des champs depuis un JSON externe
export type EventFieldsMapping = {
  id?: string;
  name?: string;
  startDateTime?: string;
  endDateTime?: string;
  gameName?: string;
  price?: string;
  status?: string;
  url?: string;
};

// Type pour les valeurs par défaut des champs
export type EventFieldsValues = {
  name?: string;
  startDateTime?: string;
  endDateTime?: string;
  gameName?: string;
  price?: number;
  status?: 'available' | 'sold-out' | 'cancelled';
  url?: string;
};

// Type pour la configuration de mapping JSON
export type EventMappingConfig = {
  eventsPath: string;
  eventsBaseUrl?: string;
  eventsFieldsMapping: EventFieldsMapping;
  eventsFieldsValues?: EventFieldsValues;
};

// Type pour une source d'événements
export type EventSource = {
  url: string;
  type: 'IA' | 'MAPPING';
  instructions?: string;
  mappingConfig?: EventMappingConfig;
};

export type Lair = {
  id: string;
  name: string;
  banner?: string;

  games: Game['id'][];

  owners: User['id'][];
  
  eventsSourceUrls?: EventSource[];
  
  /** @deprecated Utilisez les instructions dans chaque EventSource */
  eventsSourceInstructions?: string;
  
  location?: GeoJSONPoint;
  
  address?: string;
  
  website?: string;
  
  isPrivate?: boolean;
  
  invitationCode?: string;

  
  options?: {
    calendar?: {
      mode?: 'CALENDAR' | 'AGENDA' | 'CONFERENCE';
    };
  };
};
