import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getMatchResults, getPhaseStandings } from "../../actions.ts";
import PlayerStandings from "../components/PlayerStandings.tsx";
import type { EnrichedStanding } from "../../types.ts";
import { EventTableSkeleton } from "../../organizer/components/EventPortalSkeletons.tsx";
import { readPortalSettings } from "../../portalSettings.ts";


type PlayerStandingsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique. Elle s'attend sous la frontière, avec la session et les données. Le
 * cadre du portail vient du layout et reste en place d'une section à l'autre.
 */
export default function PlayerStandingsPage({ params }: PlayerStandingsPageProps) {
  return (
    <Suspense fallback={<EventTableSkeleton rows={8} columns={5} />}>
      <PlayerStandingsPageSection params={params} />
    </Suspense>
  );
}

async function PlayerStandingsPageSection({ params }: PlayerStandingsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player/standings`);
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

  const settings = await readPortalSettings(eventId);

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  let standings: EnrichedStanding[] = [];
  if (settings?.currentPhaseId) {
    const standingsResult = await getPhaseStandings(eventId, settings.currentPhaseId);
    standings = standingsResult.success ? standingsResult.data || [] : [];
  }

  return (
    <PlayerStandings
      event={event}
      settings={settings}
      userId={session.user.id}
      matches={matches}
      standings={standings}
    />
  );
}
