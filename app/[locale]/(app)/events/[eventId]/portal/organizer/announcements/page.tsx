import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getAnnouncements } from "../../actions.ts";
import OrganizerAnnouncements from "../components/OrganizerAnnouncements.tsx";
import { EventSectionSkeleton } from "../components/EventPortalSkeletons.tsx";


type OrganizerAnnouncementsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique, donc la lire ici retiendrait toute la section. Elle s'attend sous la
 * frontière, avec la session et les données. Le cadre du portail vient du layout
 * et reste en place d'une section à l'autre.
 */
export default function OrganizerAnnouncementsPage({ params }: OrganizerAnnouncementsPageProps) {
  return (
    <Suspense fallback={<EventSectionSkeleton rows={3} />}>
      <OrganizerAnnouncementsPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerAnnouncementsPageSection({ params }: OrganizerAnnouncementsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/announcements`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isOrganizerStaff = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );

  if (!isCreator && !isOrganizerStaff) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const announcementsResult = await getAnnouncements(eventId);
  const announcements = announcementsResult.success ? announcementsResult.data || [] : [];

  return (
    <OrganizerAnnouncements event={event} announcements={announcements} />
  );
}

