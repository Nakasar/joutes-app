import { createNotification } from "@/lib/db/notifications";
import { Notification } from "@/lib/types/Notification";

/**
 * Crée une notification pour un utilisateur spécifique
 */
export async function notifyUser(userId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'user',
    userId,
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour les owners d'un lair
 */
export async function notifyLairOwners(lairId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'lair',
    lairId,
    target: 'owners',
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour les followers d'un lair
 */
export async function notifyLairFollowers(lairId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'lair',
    lairId,
    target: 'followers',
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour tous (owners + followers) d'un lair
 */
export async function notifyLairAll(lairId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'lair',
    lairId,
    target: 'all',
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour les participants d'un événement
 */
export async function notifyEventParticipants(eventId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'event',
    eventId,
    target: 'participants',
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour le créateur d'un événement
 */
export async function notifyEventCreator(eventId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'event',
    eventId,
    target: 'creator',
    title,
    description,
  } as any);
}

/**
 * Crée une notification pour tous (participants + créateur) d'un événement
 */
export async function notifyEventAll(eventId: string, title: string, description: string): Promise<Notification> {
  return createNotification({
    type: 'event',
    eventId,
    target: 'all',
    title,
    description,
  } as any);
}
