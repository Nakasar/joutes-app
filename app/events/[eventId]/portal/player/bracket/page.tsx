import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings, getMatchResults } from "../../actions";
import { getEventParticipants } from "../../participant-actions";
import PlayerLayoutServer from "../components/PlayerLayoutServer";
import PlayerBracket from "../components/PlayerBracket";

type PlayerBracketPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PlayerBracketPage({ params }: PlayerBracketPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player/bracket`);
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

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <PlayerLayoutServer event={event} settings={settings}>
      <PlayerBracket
        event={event}
        settings={settings}
        userId={session.user.id}
        matches={matches}
        participants={participants}
      />
    </PlayerLayoutServer>
  );
}
