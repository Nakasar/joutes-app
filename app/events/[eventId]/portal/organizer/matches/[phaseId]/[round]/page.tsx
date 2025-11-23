import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings } from "../../../../actions";
import OrganizerPortal from "../../../../OrganizerPortal";

type OrganizerMatchesRoundPageProps = {
  params: Promise<{
    eventId: string;
    phaseId: string;
    round: string;
  }>;
};

export default async function OrganizerMatchesRoundPage({ params }: OrganizerMatchesRoundPageProps) {
  const { eventId, phaseId, round } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/matches/${phaseId}/${round}`);
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
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : null;

  return (
    <OrganizerPortal 
      event={event} 
      settings={settings} 
      userId={session.user.id}
      selectedPhaseId={phaseId}
      selectedRound={round}
    />
  );
}
