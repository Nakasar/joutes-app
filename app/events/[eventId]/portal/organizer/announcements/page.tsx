import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getPortalSettings, getAnnouncements } from "../../actions";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer";
import OrganizerAnnouncements from "../components/OrganizerAnnouncements";

type OrganizerAnnouncementsPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerAnnouncementsPage({ params }: OrganizerAnnouncementsPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/announcements`);
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

  const announcementsResult = await getAnnouncements(eventId);
  const announcements = announcementsResult.success ? announcementsResult.data || [] : [];

  return (
    <OrganizerLayoutServer event={event} settings={settings}>
      <OrganizerAnnouncements event={event} announcements={announcements} />
    </OrganizerLayoutServer>
  );
}

