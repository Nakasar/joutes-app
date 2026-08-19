import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getMatchResults } from "../../actions.ts";
import { getEventParticipants } from "../../participant-actions.ts";
import PlayerHistory from "../components/PlayerHistory.tsx";
import { EventTableSkeleton } from "../../organizer/components/EventPortalSkeletons.tsx";


type PlayerHistoryPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

/**
 * La promesse de `params` descend sans être attendue : l'événement est un segment
 * dynamique. Elle s'attend sous la frontière, avec la session et les données. Le
 * cadre du portail vient du layout et reste en place d'une section à l'autre.
 */
export default function PlayerHistoryPage({ params }: PlayerHistoryPageProps) {
  return (
    <Suspense fallback={<EventTableSkeleton rows={6} columns={4} />}>
      <PlayerHistoryPageSection params={params} />
    </Suspense>
  );
}

async function PlayerHistoryPageSection({ params }: PlayerHistoryPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player/history`);
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

  const matchesResult = await getMatchResults(eventId);
  const matches = matchesResult.success ? matchesResult.data || [] : [];

  const participantsResult = await getEventParticipants(eventId);
  const participants = participantsResult.success ? participantsResult.data || [] : [];

  return (
    <PlayerHistory
      userId={session.user.id}
      matches={matches}
      participants={participants}
    />
  );
}
