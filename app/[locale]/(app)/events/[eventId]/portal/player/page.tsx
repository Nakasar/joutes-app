import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings, getMatchResults } from "../actions.ts";
import PlayerCurrentMatch from "./components/PlayerCurrentMatch.tsx";
import { EventSectionSkeleton } from "../organizer/components/EventPortalSkeletons.tsx";


type PlayerPortalPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique. Elle s'attend sous la frontière, avec la session et les données. Le
 * cadre du portail vient du layout et reste en place d'une section à l'autre.
 */
export default function PlayerPortalPage({ params }: PlayerPortalPageProps) {
  return (
    <Suspense fallback={<EventSectionSkeleton rows={3} />}>
      <PlayerPortalPageSection params={params} />
    </Suspense>
  );
}

async function PlayerPortalPageSection({ params }: PlayerPortalPageProps) {
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
    <PlayerCurrentMatch
      event={event}
      settings={settings}
      userId={session.user.id}
      matches={matches}
    />
  );
}
