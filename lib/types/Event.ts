import { GeoJSONPoint } from "./Lair";
import {GameTypeKey} from "@/lib/constants/game-types";

export type RegistrationStatus = 'NOT_REGISTERED' | 'PRE_REGISTERED' | 'REGISTERED' | 'EXCLUDED';

/**
 * Une place dans la liste d'attente d'un événement complet.
 *
 * La file est ordonnée par `joinedAt`. Quand une place se libère, le premier
 * qui n'a pas encore d'offre en reçoit une : `offeredAt` et `offerExpiresAt`
 * sont alors posés, et la place lui est réservée jusqu'à l'échéance. Il
 * l'accepte (il devient inscrit et sort de la file), la décline ou la laisse
 * expirer (il sort de la file, et le suivant est notifié).
 * Voir `lib/events/waitlist.ts`.
 */
export type WaitlistEntry = {
  userId: string;
  joinedAt: string;
  offeredAt?: string;
  offerExpiresAt?: string;
};

export type Event = {
  id: string;
  lairId?: string;
  name: string;
  description?: string;
  startDateTime: string;
  endDateTime: string;
  gameName: string;
  game?: {
    name: string;
    icon?: string;
    banner?: string;
    type: GameTypeKey;
    slug?: string;
  };
  url?: string;
  price?: number;
  status: 'available' | 'sold-out' | 'cancelled';
  addedBy: string; // "AI-SCRAPPING", "JSON-MAPPING", "HTML-SCRAPPING" or "USER"
  /**
   * D'où un événement moissonné vient, pour le retrouver au tour suivant.
   *
   * `url` est celle de la **source configurée** sur le lieu, pas la page de
   * l'événement : c'est ce qui permet de ne retirer que les événements d'une
   * source qu'on a vraiment relue. `externalId` est l'identifiant chez la
   * source, quand une correspondance JSON en donne un — le rapprochement le
   * plus sûr qui soit. Absent des événements saisis à la main, et de ceux
   * moissonnés avant que ce champ existe.
   */
  source?: {
    url: string;
    externalId?: string;
  };
  creatorId?: string;
  creator?: {
    id: string;
    displayName?: string;
    discriminator?: string;
  };
  staff? : {
    userId: string;
    role: 'organizer' | 'judge';
  }[];
  runningState?: 'not-started' | 'ongoing' | 'completed';
  allowJoin?: boolean;
  preRegistration?: boolean; // Si true, les nouveaux inscrits ont le statut PRE_REGISTERED
  participants?: string[]; // IDs des utilisateurs inscrits à l'événement
  participantRegistrations?: { [userId: string]: RegistrationStatus }; // Statut d'inscription par participant
  /**
   * Date d'inscription de chaque participant (ISO), qui ordonne la liste des
   * inscrits. Absente pour les inscriptions antérieures à ce champ : elles
   * gardent l'ordre du tableau `participants`, et aucune date n'est affichée.
   */
  participantRegisteredAt?: { [userId: string]: string };
  registeredParticipantsCount?: number; // Nombre de participants inscrits
  maxParticipants?: number; // Nombre maximum de participants (optionnel)
  waitlist?: WaitlistEntry[]; // Liste d'attente, ouverte quand l'événement est complet
  /** Délai laissé pour accepter une place libérée, en heures. 48 h par défaut. */
  waitlistResponseHours?: number;
  favoritedBy?: string[]; // IDs des utilisateurs qui ont mis cet événement en favori
  lair?: {
    id: string;
    name: string;
    location?: GeoJSONPoint;
    address?: string;
    owners?: string[];
  };
  discordBoards?: { channelId: string; messageId: string }[];
  boardsNeedsUpdate?: boolean;
};

