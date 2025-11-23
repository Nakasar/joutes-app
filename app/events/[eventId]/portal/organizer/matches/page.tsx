import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings } from "../../actions";
import OrganizerLayout from "../components/OrganizerLayout";
import OrganizerMatches from "../components/OrganizerMatches";

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

  if (!isCreator) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success ? settingsResult.data : null;

  return (
    <OrganizerLayout event={event} settings={settings} userId={session.user.id}>
      {settings ? (
        <OrganizerMatches event={event} userId={session.user.id} />
      ) : (
        <p>Veuillez initialiser le portail dans les paramètres</p>
      )}
    </OrganizerLayout>
  );
}

