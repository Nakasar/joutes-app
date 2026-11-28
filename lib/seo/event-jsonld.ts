import type { Event } from "@/lib/types/Event";

const SITE = "https://www.joutes.app";

/**
 * La description schema.org d'un événement public (JSON-LD `Event`).
 *
 * C'est ce qui permet à Google d'afficher la date et le lieu sous le résultat,
 * et de reprendre l'événement dans ses listes d'événements : pour un agenda,
 * c'est la forme de résultat qui compte. Un événement sans lieu est privé et
 * n'en reçoit pas.
 */
export function eventJsonLd(event: Event, path: string): Record<string, unknown> | null {
  if (!event.lairId || !event.lair) return null;

  const url = `${SITE}${path}`;
  const coordinates = event.lair.location?.coordinates;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.name,
    startDate: event.startDateTime,
    endDate: event.endDateTime,
    eventStatus:
      event.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    ...(event.description ? { description: event.description.slice(0, 500) } : {}),
    ...(event.banner ? { image: [event.banner] } : {}),
    location: {
      "@type": "Place",
      name: event.lair.name,
      url: `${SITE}/lairs/${event.lair.id}`,
      ...(event.lair.address ? { address: event.lair.address } : {}),
      ...(coordinates && coordinates.length === 2
        ? { geo: { "@type": "GeoCoordinates", longitude: coordinates[0], latitude: coordinates[1] } }
        : {}),
    },
    organizer: { "@type": "Organization", name: event.lair.name, url: `${SITE}/lairs/${event.lair.id}` },
    ...(typeof event.price === "number"
      ? {
          offers: {
            "@type": "Offer",
            price: event.price,
            priceCurrency: "EUR",
            url: event.url ?? url,
            availability:
              event.status === "sold-out" ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          },
        }
      : {}),
  };
}

/**
 * Le JSON d'une balise `<script type="application/ld+json">`. `<` est échappé :
 * un nom d'événement qui contiendrait `</script>` fermerait sinon la balise.
 */
export function jsonLdScript(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
