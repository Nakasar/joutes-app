import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getAnnouncements } from "../../actions.ts";
import PlayerAnnouncements from "../components/PlayerAnnouncements.tsx";
import { EventSectionSkeleton } from "../../organizer/components/EventPortalSkeletons.tsx";


type PlayerAnnouncementsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique. Elle s'attend sous la frontière, avec la session et les données. Le
 * cadre du portail vient du layout et reste en place d'une section à l'autre.
 */
export default function PlayerAnnouncementsPage({ params }: PlayerAnnouncementsPageProps) {
  return (
    <Suspense fallback={<EventSectionSkeleton rows={3} />}>
      <PlayerAnnouncementsPageSection params={params} />
    </Suspense>
  );
}

async function PlayerAnnouncementsPageSection({ params }: PlayerAnnouncementsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player/announcements`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isParticipant = event.participants?.includes(session.user.id);

  if (!isCreator && !isParticipant) {
    redirect(`/events/${eventId}`);
  }

  const announcementsResult = await getAnnouncements(eventId);
  const announcements = announcementsResult.success ? announcementsResult.data || [] : [];

  return (
    <PlayerAnnouncements announcements={announcements} />
  );
}
