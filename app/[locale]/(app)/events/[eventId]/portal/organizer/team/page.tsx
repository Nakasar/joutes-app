import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events.ts";
import { getPortalSettings } from "../../actions.ts";
import { getStaffMembersAction } from "../../staff-actions.ts";
import OrganizerLayoutServer from "../components/OrganizerLayoutServer.tsx";
import OrganizerTeam from "../components/OrganizerTeam.tsx";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

type OrganizerTeamPageProps = {
  params: Promise<{
    eventId: string;
  }>;
};

export default async function OrganizerTeamPage({ params }: OrganizerTeamPageProps) {
  const { eventId } = await params;
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal/organizer/team`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isOrganizer = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );

  if (!isCreator && !isOrganizer) {
    redirect(`/events/${eventId}/portal/player`);
  }

  const settingsResult = await getPortalSettings(eventId);
  const settings = settingsResult.success ? settingsResult.data : null;

  const staffResult = await getStaffMembersAction(eventId);
  const staff = staffResult.success ? staffResult.data || [] : [];

  return (
    <OrganizerLayoutServer event={event} settings={settings}>
      <OrganizerTeam eventId={event.id} initialStaff={staff} isCreator={isCreator} />
    </OrganizerLayoutServer>
  );
}
