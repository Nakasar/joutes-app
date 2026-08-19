import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getMatchResults, getPhaseStandings } from "../../actions.ts";
import PlayerLayoutServer from "../components/PlayerLayoutServer.tsx";
import PlayerStandings from "../components/PlayerStandings.tsx";
import type { EnrichedStanding } from "../../types.ts";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type PlayerStandingsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PlayerStandingsPage({ params }: PlayerStandingsPageProps) {
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

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success ? settingsResult.data : null;

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  let standings: EnrichedStanding[] = [];
  if (settings?.currentPhaseId) {
    const standingsResult = await getPhaseStandings(eventId, settings.currentPhaseId);
    standings = standingsResult.success ? standingsResult.data || [] : [];
  }

  return (
    <PlayerLayoutServer event={event} settings={settings}>
      <PlayerStandings
        event={event}
        settings={settings}
        userId={session.user.id}
        matches={matches}
        standings={standings}
      />
    </PlayerLayoutServer>
  );
}
