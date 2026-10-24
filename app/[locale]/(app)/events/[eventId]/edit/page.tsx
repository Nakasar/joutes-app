import { Suspense } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { EditorFormSkeleton } from "@/components/EditorFormSkeleton.tsx";
import { BackLink } from "@/components/navigation/BackLink.tsx";
import { auth } from "@/lib/auth.ts";
import { getEventById } from "@/lib/db/events.ts";
import { getLairsOwnedByUser } from "@/lib/db/lairs.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { canManageEvent } from "@/lib/events/tournament-link.ts";
import EventForm from "../../EventForm.tsx";

type EditEventPageProps = {
  params: Promise<{ eventId: string }>;
};

/**
 * La modification d'un événement : le formulaire de création, rempli.
 *
 * Réservée à l'organisation (créateur et organisateurs du staff), comme
 * `updateEventDetailsAction` qui le revérifie.
 */
async function EditEventPageContent({ params }: EditEventPageProps) {
  await connection();
  const { eventId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect(`/login?redirect=${encodeURIComponent(`/events/${eventId}/edit`)}`);
  }

  const event = await getEventById(eventId);
  if (!event) {
    notFound();
  }
  if (!canManageEvent(event, session.user.id)) {
    redirect(`/events/${eventId}`);
  }

  const [ownedLairs, games, t] = await Promise.all([
    getLairsOwnedByUser(session.user.id),
    getAllGames(),
    getTranslations("EventCreate"),
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink
          href={`/events/${event.id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          label={event.name}
        >
          <ArrowLeft className="size-4" />
        </BackLink>
        <h1 className="text-3xl font-bold">{t("form.edit.title")}</h1>
      </div>
      <EventForm
        ownedLairs={ownedLairs}
        games={games}
        event={{
          id: event.id,
          name: event.name,
          description: event.description,
          banner: event.banner,
          gameName: event.gameName,
          lairId: event.lairId,
          lairName: event.lair?.name,
          startDateTime: event.startDateTime,
          endDateTime: event.endDateTime,
          url: event.url,
          price: event.price,
          maxParticipants: event.maxParticipants,
          participantsVisibility: event.participantsVisibility,
          registeredCount: event.registeredParticipantsCount ?? 0,
        }}
      />
    </div>
  );
}

export default function EditEventPage(props: EditEventPageProps) {
  return (
    <div className="container mx-auto max-w-6xl p-4 sm:p-6">
      <Suspense fallback={<EditorFormSkeleton fields={6} label="Chargement du formulaire" />}>
        <EditEventPageContent {...props} />
      </Suspense>
    </div>
  );
}
