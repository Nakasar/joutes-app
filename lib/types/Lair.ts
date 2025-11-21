import {Game} from "@/lib/types/Game";
import {User} from "@/lib/types/User";

// Type GeoJSON Point pour MongoDB
export type GeoJSONPoint = {
  type: "Point";
  coordinates: [number, number]; // [longitude, latitude]
};

export type Lair = {
  id: string;
  name: string;
  banner?: string;

  games: Game['id'][];

  owners: User['id'][];
  
  eventsSourceUrls?: string[];
  
  eventsSourceInstructions?: string;
  
  location?: GeoJSONPoint;
  
  address?: string;
  
  website?: string;
  
  isPrivate?: boolean;
  
  invitationCode?: string;

  
  options?: {
    calendar?: {
      mode?: 'CALENDAR' | 'AGENDA';
    };
  };
};
