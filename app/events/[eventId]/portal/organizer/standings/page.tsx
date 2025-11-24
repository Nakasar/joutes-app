import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings, getPhaseStandings } from "../../actions";
import { getEventParticipants } from "../../participant-actions";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer";
import OrganizerStandings from "../components/OrganizerStandings";

type OrganizerStandingsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerStandingsPage({ params }: OrganizerStandingsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/standings`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  // Vérifier que l'utilisateur est le créateur
  if (event.creatorId !== session.user.id) {
    redirect(`/events/${eventId}`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : null;

  if (!settings) {
    redirect(`/events/${eventId}/portal/organizer`);
  }

  // Charger les classements de la phase courante
  let standings: any[] = [];
  if (settings.currentPhaseId) {
    const standingsResult = await getPhaseStandings(eventId, settings.currentPhaseId);
    standings = standingsResult.success ? standingsResult.data || [] : [];
  }

  // Charger les participants
  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <OrganizerLayoutServer event={event} settings={settings}>
      <OrganizerStandings
        event={event}
        settings={settings}
        standings={standings}
        participants={participants}
      />
    </OrganizerLayoutServer>
  );
}
