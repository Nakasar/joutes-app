import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getMatchResults } from "../../actions.ts";
import { getEventParticipants } from "../../participant-actions.ts";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer.tsx";
import OrganizerMatches from "../components/OrganizerMatches.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type OrganizerMatchesPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerMatchesPage({ params }: OrganizerMatchesPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/matches`);
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
  const settings = settingsResult.success ? settingsResult.data : null;

  if (!settings) {
    return (
      <OrganizerLayoutServer event={event} settings={null}>
        <p>Veuillez initialiser le portail dans les paramètres</p>
      </OrganizerLayoutServer>
    );
  }

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <OrganizerLayoutServer event={event} settings={settings}>
      <OrganizerMatches
        event={event}
        settings={settings}
        matches={matches}
        participants={participants}
        userId={session.user.id}
      />
    </OrganizerLayoutServer>
  );
}

