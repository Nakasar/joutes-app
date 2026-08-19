import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getMatchResults } from "../actions.ts";
import PlayerLayoutServer from "./components/PlayerLayoutServer.tsx";
import PlayerCurrentMatch from "./components/PlayerCurrentMatch.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type PlayerPortalPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PlayerPortalPage({ params }: PlayerPortalPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isParticipant = event.participants?.includes(session.user.id);

  if (!isCreator && !isParticipant) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Accès refusé</h1>
          <p className="text-muted-foreground">
            Vous devez être participant de cet événement pour accéder au portail.
          </p>
        </div>
      </div>
    );
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success && settingsResult.data ? settingsResult.data : null;

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  return (
    <PlayerLayoutServer event={event} settings={settings}>
      <PlayerCurrentMatch
        event={event}
        settings={settings}
        userId={session.user.id}
        matches={matches}
      />
    </PlayerLayoutServer>
  );
}
