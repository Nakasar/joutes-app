import { Event } from "../types/Event";

export function isUserOrganizer(event: Event, userId?: string): boolean {
  if (!event.staff || !userId) return false;
  return event.staff.some(s => s.userId === userId && s.role === 'organizer');
}
