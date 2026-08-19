import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getMatchResults } from "../../../../actions.ts";
import { getEventParticipants } from "../../../../participant-actions.ts";
import OrganizerMatches from "../../../components/OrganizerMatches.tsx";
import { EventTableSkeleton } from "../../../components/EventPortalSkeletons.tsx";


type OrganizerMatchesRoundPageProps = {
  params: Promise<{
    eventId: string;
    phaseId: string;
    round: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique, donc la lire ici retiendrait toute la section. Elle s'attend sous la
 * frontière, avec la session et les données. Le cadre du portail vient du layout
 * et reste en place d'une section à l'autre.
 */
export default function OrganizerMatchesRoundPage({ params }: OrganizerMatchesRoundPageProps) {
  return (
    <Suspense fallback={<EventTableSkeleton rows={6} columns={4} />}>
      <OrganizerMatchesRoundPageSection params={params} />
    </Suspense>
  );
}

async function OrganizerMatchesRoundPageSection({ params }: OrganizerMatchesRoundPageProps) {
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
  const isOrganizerStaff = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );

  if (!isCreator && !isOrganizerStaff) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : null;

  if (!settings) {
    return (
      <p>Veuillez initialiser le portail dans les paramètres</p>
    );
  }

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <OrganizerMatches
      event={event}
      settings={settings}
      matches={matches}
      participants={participants}
      selectedPhaseId={phaseId}
      selectedRound={round}
      userId={session.user.id}
    />
  );
}

