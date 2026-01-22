import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings } from "../../actions";
import { getEventParticipants } from "../../participant-actions";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer";
import OrganizerParticipants from "../components/OrganizerParticipants";

type OrganizerParticipantsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerParticipantsPage({ params }: OrganizerParticipantsPageProps) {
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

  if (!isCreator) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success ? settingsResult.data : null;

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <OrganizerLayoutServer event={event} settings={settings}>
      <OrganizerParticipants 
        eventId={event.id} 
        participants={participants} 
        runningState={event.runningState}
      />
    </OrganizerLayoutServer>
  );
}
