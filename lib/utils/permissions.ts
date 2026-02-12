import { Event } from "../types/Event";

export function isUserOrganizer(event: Event, userId?: string): boolean {
  if (!event.staff || !userId) return false;
  if (event.creatorId === userId) return true;
  return event.staff.some(s => s.userId === userId && s.role === 'organizer');
}
