/**
 * Un événement au format iCalendar (RFC 5545), pour « Ajouter à mon agenda ».
 *
 * Les heures s'écrivent en UTC (`…Z`) : l'agenda du joueur les ramène à son
 * fuseau, quelle que soit la forme stockée (`…Z` ou avec décalage).
 */

type IcsEvent = {
  id: string;
  name: string;
  startDateTime: string;
  endDateTime: string;
  location?: string;
  url?: string;
  description?: string;
};

function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Échappe le texte d'une propriété : antislash, virgule, point-virgule, retours. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function buildEventIcs(event: IcsEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Joutes//Evenements//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@joutes.app`,
    `DTSTAMP:${toIcsDate(now.toISOString())}`,
    `DTSTART:${toIcsDate(event.startDateTime)}`,
    `DTEND:${toIcsDate(event.endDateTime)}`,
    `SUMMARY:${escapeText(event.name)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeText(event.description)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
