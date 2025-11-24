import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings, getAnnouncements } from "../../actions";
import PlayerLayoutServer from "../components/PlayerLayoutServer";
import PlayerAnnouncements from "../components/PlayerAnnouncements";

type PlayerAnnouncementsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function PlayerAnnouncementsPage({ params }: PlayerAnnouncementsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/player/announcements`);
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

  const announcementsResult = await getAnnouncements(eventId);
  const announcements = announcementsResult.success ? announcementsResult.data || [] : [];

  return (
    <PlayerLayoutServer event={event} settings={settings}>
      <PlayerAnnouncements announcements={announcements} />
    </PlayerLayoutServer>
  );
}
