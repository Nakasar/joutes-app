import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getStaffMembersAction } from "../../staff-actions.ts";
import OrganizerTeam from "../components/OrganizerTeam.tsx";
import { EventSectionSkeleton } from "../components/EventPortalSkeletons.tsx";


type OrganizerTeamPageProps = {
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
export default function OrganizerTeamPage({ params }: OrganizerTeamPageProps) {
  return (
    <Suspense fallback={<EventSectionSkeleton rows={3} />}>
      <OrganizerTeamPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerTeamPageSection({ params }: OrganizerTeamPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/team`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isOrganizer = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );

  if (!isCreator && !isOrganizer) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const staffResult = await getStaffMembersAction(eventId);
  const staff = staffResult.success ? staffResult.data || [] : [];

  return (
    <OrganizerTeam eventId={event.id} initialStaff={staff} isCreator={isCreator} />
  );
}
