import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings } from "../../actions";
import PlayerLayout from "../components/PlayerLayout";
import PlayerStandings from "../components/PlayerStandings";

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

  return (
    <PlayerLayout event={event} settings={settings} userId={session.user.id}>
      {({ matches, participants, standings }) => (
        <PlayerStandings
          event={event}
          settings={settings}
          userId={session.user.id}
          matches={matches}
          standings={standings}
        />
      )}
    </PlayerLayout>
  );
}
