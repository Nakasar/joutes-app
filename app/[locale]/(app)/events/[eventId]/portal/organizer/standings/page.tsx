import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getPhaseStandings } from "../../actions.ts";
import { getEventParticipants } from "../../participant-actions.ts";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer.tsx";
import OrganizerStandings from "../components/OrganizerStandings.tsx";
import type { EnrichedStanding } from "../../types.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

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

  // Vérifier que l'utilisateur est le créateur ou un organizer staff
  const isCreator = event.creatorId === session.user.id;
  const isOrganizerStaff = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );

  if (!isCreator && !isOrganizerStaff) {
    redirect(`/events/${eventId}`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : null;

  if (!settings) {
    redirect(`/events/${eventId}/portal/organizer`);
  }

  // Charger les classements de la phase courante
  let standings: EnrichedStanding[] = [];
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
