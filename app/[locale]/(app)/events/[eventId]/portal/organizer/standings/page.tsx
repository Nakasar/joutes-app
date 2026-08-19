import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getPhaseStandings } from "../../actions.ts";
import { getEventParticipants } from "../../participant-actions.ts";
import OrganizerStandings from "../components/OrganizerStandings.tsx";
import type { EnrichedStanding } from "../../types.ts";
import { EventTableSkeleton } from "../components/EventPortalSkeletons.tsx";


type OrganizerStandingsPageProps = {
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
export default function OrganizerStandingsPage({ params }: OrganizerStandingsPageProps) {
  return (
    <Suspense fallback={<EventTableSkeleton rows={8} columns={5} />}>
      <OrganizerStandingsPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerStandingsPageSection({ params }: OrganizerStandingsPageProps) {
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
    <OrganizerStandings
      event={event}
      settings={settings}
      standings={standings}
      participants={participants}
    />
  );
}
