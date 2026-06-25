import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getTranslations } from "next-intl/server";

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
  const t = await getTranslations("EventPortal");

  if (!session?.user) {
    redirect(`/login?from=/events/${eventId}/portal`);
  }

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  const isCreator = event.creatorId === session.user.id;
  const isOrganizerStaff = event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );
  const isParticipant = event.participants?.includes(session.user.id);

  if (!isCreator && !isOrganizerStaff && !isParticipant) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">{t("accessDenied.title")}</h1>
          <p className="text-muted-foreground">
            {t("accessDenied.description")}
          </p>
        </div>
      </div>
    );
  }

  // Rediriger vers le portail approprié
  if (isCreator || isOrganizerStaff) {
    redirect(`/events/${eventId}/portal/organizer`);
  }

  redirect(`/events/${eventId}/portal/player`);
}
