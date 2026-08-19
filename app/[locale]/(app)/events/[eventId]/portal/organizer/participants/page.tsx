import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getEventParticipants } from "../../participant-actions.ts";
import OrganizerParticipants from "../components/OrganizerParticipants.tsx";
import { EventSectionSkeleton } from "../components/EventPortalSkeletons.tsx";

type Params = Promise<{ eventId: string }>;

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique, donc la lire ici retiendrait toute la section. Elle s'attend sous la
 * frontière, avec la session et la liste des participants. Le cadre du portail
 * vient du layout et reste en place d'une section à l'autre.
 */
export default function OrganizerParticipantsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<EventSectionSkeleton rows={8} />}>
      <ParticipantsSection params={params} />
    </Suspense>
  );
}

async function ParticipantsSection({ params }: { params: Params }) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/participants`);
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

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <OrganizerParticipants
      eventId={event.id}
      participants={participants}
      runningState={event.runningState}
      preRegistration={event.preRegistration}
    />
  );
}
