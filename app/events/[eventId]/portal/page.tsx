import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings } from "./actions";
import OrganizerPortal from "./OrganizerPortal";
import PlayerPortal from "./PlayerPortal";

type PortalPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PortalPage({ params }: PortalPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal`);
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
            Vous devez être créateur ou participant de cet événement pour accéder au portail.
          </p>
        </div>
      </div>
    );
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success ? settingsResult.data : null;

  if (isCreator) {
    return <OrganizerPortal event={event} settings={settings} userId={session.user.id} />;
  }

  return <PlayerPortal event={event} settings={settings} userId={session.user.id} />;
}
