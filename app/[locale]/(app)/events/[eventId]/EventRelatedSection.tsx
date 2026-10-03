import { getLocale, getTranslations } from "next-intl/server";
import { DateTime } from "luxon";
import { getRelatedEventCandidates, type RelatedEventSummary } from "@/lib/db/events.ts";
import { pickRelatedEvents } from "@/lib/events/related-events.ts";
import type { Event } from "@/lib/types/Event.ts";
import RelatedEventsList, { type RelatedEventItem } from "./RelatedEventsList.tsx";

const EVENT_ZONE = "Europe/Paris";

/**
 * Section « Événements liés » de la page d'un événement : les événements que
 * l'organisation a liés, puis jusqu'à trois prochains événements du même lieu
 * au titre proche (voir `lib/events/related-events.ts`). L'organisation y lie
 * et délie des événements.
 *
 * Rien ne s'affiche quand il n'y a rien à montrer, sauf pour l'organisation,
 * qui doit pouvoir poser un premier lien.
 */
export async function EventRelatedSection({
  event,
  viewerId,
  canManage,
}: {
  event: Event;
  viewerId: string | null;
  canManage: boolean;
}) {
  const now = new Date();
  const [{ linked, candidates }, locale, t] = await Promise.all([
    getRelatedEventCandidates(event, now),
    getLocale(),
    getTranslations("EventDetail.related"),
  ]);

  // Un événement privé lié ne s'affiche qu'à qui peut l'ouvrir.
  const visible = (entry: RelatedEventSummary) =>
    Boolean(
      entry.lairId ||
        (viewerId && (entry.creatorId === viewerId || entry.participants?.includes(viewerId)))
    );

  const related = pickRelatedEvents({
    event,
    linked: linked.filter(visible),
    candidates: candidates.filter(visible),
    now,
  });

  if (!canManage && related.linked.length === 0 && related.similar.length === 0) {
    return null;
  }

  const toItem = (entry: RelatedEventSummary, kind: RelatedEventItem["kind"]): RelatedEventItem => {
    const start = DateTime.fromISO(entry.startDateTime).setZone(EVENT_ZONE).setLocale(locale);
    return {
      id: entry.id,
      name: entry.name,
      kind,
      month: start.isValid ? start.toFormat("LLL") : "",
      day: start.isValid ? start.toFormat("d") : "?",
      when: start.isValid ? start.toFormat("cccc d LLLL, HH:mm") : "",
      lairName: entry.lairId !== event.lairId ? entry.lairName : undefined,
      cancelled: entry.status === "cancelled",
      past: start.isValid && start.toMillis() < now.getTime(),
    };
  };

  return (
    <RelatedEventsList
      eventId={event.id}
      items={[
        ...related.linked.map((entry) => toItem(entry, "linked")),
        ...related.similar.map((entry) => toItem(entry, "similar")),
      ]}
      canManage={canManage}
      hint={event.lairId ? t("similarHint") : null}
    />
  );
}
