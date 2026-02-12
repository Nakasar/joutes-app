import { GeoJSONPoint } from "./Lair";

export type RegistrationStatus = 'PRE_REGISTERED' | 'REGISTERED' | 'EXCLUDED';

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
  preRegistration?: boolean; // Si true, les nouveaux inscrits ont le statut PRE_REGISTERED
  participants?: string[]; // IDs des utilisateurs inscrits à l'événement
  participantRegistrations?: { [userId: string]: RegistrationStatus }; // Statut d'inscription par participant
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

/**
 * Retourne le nombre de participants avec le statut REGISTERED.
 * Si preRegistration n'est pas activé, tous les participants sont considérés comme REGISTERED.
 */
export function getRegisteredParticipantCount(event: Event): number {
  if (!event.participants) return 0;
  if (!event.preRegistration || !event.participantRegistrations) {
    return event.participants.length;
  }
  return event.participants.filter(
    userId => event.participantRegistrations?.[userId] === 'REGISTERED'
  ).length;
}

/**
 * Retourne les IDs des participants avec le statut REGISTERED.
 * Si preRegistration n'est pas activé, retourne tous les participants.
 */
export function getRegisteredParticipantIds(event: Event): string[] {
  if (!event.participants) return [];
  if (!event.preRegistration || !event.participantRegistrations) {
    return event.participants;
  }
  return event.participants.filter(
    userId => event.participantRegistrations?.[userId] === 'REGISTERED'
  );
}
