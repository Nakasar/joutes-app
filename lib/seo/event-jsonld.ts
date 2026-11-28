import type { Event } from "@/lib/types/Event";

const SITE = "https://www.joutes.app";

/**
 * La description schema.org d'un événement public (JSON-LD `Event`).
 *
 * C'est ce qui permet à Google d'afficher la date et le lieu sous le résultat,
 * et de reprendre l'événement dans ses listes d'événements : pour un agenda,
 * c'est la forme de résultat qui compte.
 */
/**
 * Un événement qu'un moteur de recherche n'a pas à connaître : sans lieu (il
 * est réservé à son créateur et à ses inscrits), ou dans un lieu privé — chez
 * un particulier, par exemple —, dont l'adresse ne se publie pas.
 */
export function isUnlistedEvent(event: Pick<Event, "lairId" | "lair">): boolean {
  return !event.lairId || !event.lair || event.lair.isPrivate === true;
}

export function eventJsonLd(event: Event, path: string): Record<string, unknown> | null {
  const lair = event.lair;
  if (!lair || isUnlistedEvent(event)) return null;

  const url = `${SITE}${path}`;
  const coordinates = lair.location?.coordinates;

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
      name: lair.name,
      url: `${SITE}/lairs/${lair.id}`,
      ...(lair.address ? { address: lair.address } : {}),
      ...(coordinates && coordinates.length === 2
        ? { geo: { "@type": "GeoCoordinates", longitude: coordinates[0], latitude: coordinates[1] } }
        : {}),
    },
    organizer: { "@type": "Organization", name: lair.name, url: `${SITE}/lairs/${lair.id}` },
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
