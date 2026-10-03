import { EventDetailSkeleton } from "./EventDetailSkeleton.tsx";
import { Suspense, cache } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { getEventById, hasLegacyEventPortal } from "@/lib/db/events.ts";
import { getTournamentByEventId } from "@/lib/db/tournaments.ts";
import { getUsersByIds } from "@/lib/db/users.ts";
import { getLairById } from "@/lib/db/lairs.ts";
import { canManageEvent } from "@/lib/events/tournament-link.ts";
import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import {
  CalendarDays,
  MapPin,
  Users,
  ExternalLink,
  Clock,
  Gamepad2,
  Info,
  Lock,
  CheckCircle,
  AlertCircle as AlertCircleIcon,
  Settings,
  Star,
  History,
} from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import EventActions from "./EventActions.tsx";
import QRCodeButton from "./QRCodeButton.tsx";
import ParticipantManagerWrapper from "./ParticipantManagerWrapper.tsx";
import { type Participant } from "./AddParticipantForm.tsx";
import FavoriteButton from "./FavoriteButton.tsx";
import AllowJoinSwitch from "./AllowJoinSwitch.tsx";
import PreRegistrationSwitch from "./PreRegistrationSwitch.tsx";
import RunningStateManager from "./RunningStateManager.tsx";
import CancelEventButton from "./CancelEventButton.tsx";
import DeleteEventButton from "./DeleteEventButton.tsx";
import { EventTournamentSection } from "./EventTournamentSection.tsx";
import EventAnnouncements from "./EventAnnouncements.tsx";
import { EventRelatedSection } from "./EventRelatedSection.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import { DateTime } from "luxon";
import { getEventParticipants, getEventWaitlist } from "./portal/participant-actions.ts";
import { getAnnouncements } from "./portal/actions.ts";
import WaitlistOfferBanner from "./WaitlistOfferBanner.tsx";
import WaitlistManager, { type WaitlistManagerEntry } from "./WaitlistManager.tsx";
import { canJoinDirectly, isWaitlistOpen, responseHoursOf, viewerWaitlistStatus } from "@/lib/events/waitlist.ts";
import ReactMarkdown from "react-markdown";
import { getLocale, getTranslations } from "next-intl/server";
import type { Event } from "@/lib/types/Event.ts";

// Les heures d'un événement se lisent à l'heure du lieu, comme dans l'agenda.
const EVENT_ZONE = "Europe/Paris";

type EventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    joined?: string;
    error?: string;
  }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  // Le pilote Mongo touche à l'horloge en lisant la base, ce qu'un prérendu
  // ne sait pas figer. Les métadonnées s'exécutent hors de la frontière de la
  // page : le déblocage du corps ne les couvre pas.
  await connection();

  const { eventId } = await params;
  const event = await getEventById(eventId);

  if (!event) {
    return { title: "Événement introuvable" };
  }

  // Les événements privés (sans lieu partenaire associé) ne doivent pas être indexés
  // ni divulguer leurs détails dans les métadonnées, même si la page redirige déjà
  // les utilisateurs non autorisés.
  const isPrivateEvent = !event.lairId;
  if (isPrivateEvent) {
    return {
      title: event.name,
      robots: { index: false, follow: false },
    };
  }

  const startDate = DateTime.fromISO(event.startDateTime)
    .setLocale("fr")
    .toLocaleString(DateTime.DATE_FULL);
  const locationPart = event.lair?.name ? ` à ${event.lair.name}` : "";
  const description = event.description
    ? event.description.slice(0, 160)
    : `Événement ${event.gameName} le ${startDate}${locationPart}.`;

  return {
    title: event.name,
    description,
    openGraph: {
      title: `${event.name} - Joutes`,
      description,
    },
  };
}

/**
 * L'événement, lu une fois par rendu — et sa porte avec lui.
 *
 * Un événement sans lieu est privé : il ne s'ouvre qu'à son créateur et à ses
 * participants. Comme pour un lieu ou une ligue, la confidentialité se lit sur
 * l'événement lui-même, et **la session n'est interrogée que dans ce cas**. Un
 * événement de boutique s'affiche dès sa lecture.
 *
 * L'écran de refus est rendu ici plutôt qu'un `notFound()` : un événement privé
 * existe, il n'est simplement pas ouvert, et le dire vaut mieux que prétendre
 * qu'il n'existe pas.
 */
const readEventAccess = cache(async (eventId: string) => {
  // Le pilote Mongo touche à l'horloge en lisant l'événement, ce qu'un prérendu
  // ne sait pas figer, et aucune frontière n'y change rien.
  await connection();

  const event = await getEventById(eventId);
  if (!event) {
    notFound();
  }

  const isPrivateEvent = !event.lairId;
  if (!isPrivateEvent) {
    return { event, isPrivateEvent, hasAccess: true as const };
  }

  const session = await auth.api.getSession({ headers: await headers() });
  const isCreator = Boolean(session?.user && event.creatorId === session.user.id);
  const isParticipant = Boolean(session?.user && event.participants?.includes(session.user.id));

  return { event, isPrivateEvent, hasAccess: isCreator || isParticipant };
});

/**
 * La page d'un événement : c'est là que mène tout clic sur un événement, dans
 * l'agenda comme sur la page d'un lieu.
 *
 * L'événement est le rendez-vous — date, lieu, inscriptions, liste d'attente,
 * annonces ; le tournoi associé, quand il y en a un, est le déroulé de la
 * session et a sa propre section. Le site du lieu n'est plus la destination du
 * clic : il figure en encart.
 *
 * Deux frontières : l'en-tête ne tient qu'à l'événement, quand le corps demande
 * en plus la session, le tournoi associé, les annonces, et pour l'organisation
 * seule la liste des participants. Les bandeaux d'inscription et d'erreur ne
 * tiennent qu'à la query : ils arrivent avec l'en-tête.
 */
export default function EventPage({ params, searchParams }: EventPageProps) {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <div className="space-y-6">
        <Suspense fallback={<EventDetailSkeleton section="header" />}>
          <EventHeader params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<EventDetailSkeleton section="body" />}>
          <EventBody params={params} />
        </Suspense>
      </div>
    </div>
  );
}

async function EventHeader({ params, searchParams }: EventPageProps) {
  const { eventId } = await params;
  const [search, { event, isPrivateEvent, hasAccess }, t, locale] = await Promise.all([
    searchParams,
    readEventAccess(eventId),
    getTranslations("EventDetail"),
    getLocale(),
  ]);

  if (!hasAccess) {
    return null;
  }

  const start = DateTime.fromISO(event.startDateTime).setZone(EVENT_ZONE).setLocale(locale);
  const end = DateTime.fromISO(event.endDateTime).setZone(EVENT_ZONE).setLocale(locale);
  const sameDay = start.hasSame(end, "day");

  return (
    <>
      {search.joined && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {t("joined")}
          </AlertDescription>
        </Alert>
      )}
      {search.error && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>
            {decodeURIComponent(search.error)}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-start gap-4 sm:gap-5">
        {/* Le repère de calendrier : jour, mois, jour de la semaine. */}
        <div className="w-16 shrink-0 overflow-hidden rounded-lg border text-center sm:w-[4.5rem]" aria-hidden>
          <div className="bg-primary py-0.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground">
            {start.toFormat("LLL")}
          </div>
          <div className="pt-1 text-2xl font-bold tabular-nums sm:text-[28px]">{start.toFormat("d")}</div>
          <div className="pb-1.5 text-[11px] text-muted-foreground">{start.toFormat("ccc")}</div>
        </div>

        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">
              <Gamepad2 className="h-3 w-3 mr-1" />
              {event.gameName}
            </Badge>
            <Badge
              variant={
                event.status === "available"
                  ? "default"
                  : event.status === "cancelled"
                  ? "destructive"
                  : "secondary"
              }
            >
              {event.status === "available" && t("status.available")}
              {event.status === "sold-out" && t("status.soldOut")}
              {event.status === "cancelled" && t("status.cancelled")}
            </Badge>
            {event.runningState === "ongoing" && (
              <Badge variant="default" className="bg-green-600">
                {t("runningState.ongoing")}
              </Badge>
            )}
            {event.runningState === "completed" && (
              <Badge variant="secondary">
                {t("runningState.completed")}
              </Badge>
            )}
            {isPrivateEvent && (
              <Badge variant="secondary">
                <Lock className="h-3 w-3 mr-1" />
                {t("privateBadge")}
              </Badge>
            )}
          </div>

          <div className="flex items-start justify-between gap-2">
            <h1 className="text-2xl font-bold tracking-tight [text-wrap:balance] sm:text-3xl">{event.name}</h1>
            <ReportButton contentType="event" contentId={event.id} />
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" />
              <span className="font-medium text-foreground first-letter:uppercase">
                {start.toLocaleString(DateTime.DATE_HUGE)}
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span className="font-medium tabular-nums text-foreground">
                {start.toLocaleString(DateTime.TIME_SIMPLE)}
                {" – "}
                {sameDay
                  ? end.toLocaleString(DateTime.TIME_SIMPLE)
                  : end.toLocaleString(DateTime.DATETIME_MED)}
              </span>
            </span>
            {event.lair && (
              <span className="flex min-w-0 items-center gap-1.5">
                <MapPin className="h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  <Link href={`/lairs/${event.lair.id}`} className="font-medium text-foreground hover:underline">
                    {event.lair.name}
                  </Link>
                  {event.lair.address && <>, {event.lair.address}</>}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Nom de domaine affiché sous le lien vers le site du lieu. */
function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function EventBody({ params }: Pick<EventPageProps, "params">) {
  const { eventId } = await params;
  const [{ event, isPrivateEvent, hasAccess }, t, locale] = await Promise.all([
    readEventAccess(eventId),
    getTranslations("EventDetail"),
    getLocale(),
  ]);

  if (!hasAccess) {
    return (
      <Alert>
        <Lock className="h-4 w-4" />
        <AlertDescription>
          {t("privateEvent.title")}
        </AlertDescription>
      </Alert>
    );
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const viewerId = session?.user?.id ?? null;

  const isCreator = Boolean(viewerId && event.creatorId === viewerId);
  // Créateur ou staff organisateur : annonces, tournoi associé, ancien portail.
  // La gestion des inscrits reste au créateur, comme ses actions serveur.
  const canManage = canManageEvent(event, viewerId);
  const isParticipant = Boolean(viewerId && event.participants?.includes(viewerId));
  // Les gérants du lieu voient qui s'intéresse à l'événement, comme le
  // montrait la fenêtre de l'agenda. Le lieu n'est relu que pour eux.
  const isLairOwner = Boolean(
    viewerId && !canManage && event.lairId &&
    (await getLairById(event.lairId).catch(() => null))?.owners?.includes(viewerId)
  );
  const isFavorited = Boolean(viewerId && event.favoritedBy?.includes(viewerId));

  const linkedTournament = await getTournamentByEventId(event.id);

  // Les annonces s'adressent aux inscrits : l'action les refuse aux autres.
  const announcementsResult = canManage || isParticipant
    ? await getAnnouncements(event.id)
    : null;
  const announcements = announcementsResult?.success ? announcementsResult.data ?? [] : [];

  // L'ancien portail (rondes et classements portés par l'événement) n'est plus
  // proposé qu'aux événements qui l'ont utilisé. Voir hasLegacyEventPortal.
  const legacyPortal = (canManage || isParticipant) && await hasLegacyEventPortal(event.id);

  // La liste complète ne sert qu'à l'organisation : personne d'autre ne la
  // charge, et `isFull` n'a de sens que pour elle.
  const participantsResult = isCreator
    ? await getEventParticipants(event.id)
    : { success: true, data: [] };

  const allParticipants = participantsResult.success && participantsResult.data
    ? participantsResult.data
    : [];

  // Le compte vient de l'événement, pas de la liste : elle n'est chargée que
  // pour l'organisation, et tout le monde doit lire le même remplissage.
  const registeredCount = event.registeredParticipantsCount ?? 0;

  // Liste d'attente : « complet » tient compte des places réservées aux
  // offres en cours et des joueurs qui attendent déjà (cf. lib/events/waitlist).
  const now = new Date();
  const isFull = !canJoinDirectly(event, now);
  const waitlistCount = event.waitlist?.length ?? 0;
  const viewerWaitlist = viewerId ? viewerWaitlistStatus(event, viewerId, now) : null;

  const waitlistResult = isCreator && event.maxParticipants
    ? await getEventWaitlist(event.id)
    : { success: true, data: [] };
  const waitlistEntries: WaitlistManagerEntry[] = waitlistResult.success && waitlistResult.data
    ? waitlistResult.data
    : [];

  const fillRatio = event.maxParticipants
    ? Math.min(1, registeredCount / event.maxParticipants)
    : null;
  const externalHost = event.url ? hostnameOf(event.url) : null;

  return (
    <>
      {isPrivateEvent && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("privateEvent.description")}
          </AlertDescription>
        </Alert>
      )}

      {viewerWaitlist?.offer && (
        <WaitlistOfferBanner eventId={event.id} expiresAt={viewerWaitlist.offer.expiresAt} />
      )}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 space-y-8 lg:col-span-2">
          {event.description && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold">{t("sections.about")}</h2>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{event.description}</ReactMarkdown>
              </div>
            </section>
          )}

          <EventTournamentSection
            event={event}
            tournament={linkedTournament}
            viewerId={viewerId}
            canManage={canManage}
          />

          {(canManage || isParticipant) && (
            <EventAnnouncements
              eventId={event.id}
              announcements={announcements}
              canPost={canManage}
            />
          )}

          {legacyPortal && (
            <section className="space-y-2 rounded-lg border border-dashed p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <History className="h-4 w-4" />
                {t("legacyPortal.title")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("legacyPortal.description")}</p>
              <div className="flex flex-wrap gap-2">
                {canManage && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/events/${event.id}/portal/organizer`}>
                      <Settings className="h-4 w-4 mr-2" />
                      {t("portalButtons.organizer")}
                    </Link>
                  </Button>
                )}
                {isParticipant && (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/events/${event.id}/portal/player`}>
                      <Users className="h-4 w-4 mr-2" />
                      {t("portalButtons.player")}
                    </Link>
                  </Button>
                )}
              </div>
            </section>
          )}

          <EventRelatedSection event={event} viewerId={viewerId} canManage={canManage} />
        </div>

        <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-20">
          <Card className="gap-4">
            <CardHeader>
              <div className="flex items-baseline justify-between gap-2">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {t("sections.registration")}
                </CardTitle>
                <span className="text-xl font-bold tabular-nums">
                  {(event.price === 0 || !event.price)
                    ? t("priceFree")
                    : new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(event.price)}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                {fillRatio !== null && (
                  <div
                    className="h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={event.maxParticipants}
                    aria-valuenow={registeredCount}
                    aria-label={t("sections.participants")}
                  >
                    <div className="h-full rounded-full bg-foreground" style={{ width: `${fillRatio * 100}%` }} />
                  </div>
                )}
                <p className="flex flex-wrap justify-between gap-x-2 text-sm">
                  <span>
                    {event.maxParticipants
                      ? t("participantsCountWithMax", { count: registeredCount, max: event.maxParticipants })
                      : t("participantsCount", { count: registeredCount })}
                  </span>
                  {waitlistCount > 0 && (
                    <span className="text-muted-foreground">{t("waitlist.count", { count: waitlistCount })}</span>
                  )}
                </p>
              </div>

              {session?.user ? (
                <div className="space-y-2">
                  <EventActions
                    eventId={event.id}
                    isParticipant={isParticipant}
                    isCreator={isCreator}
                    isFull={isFull}
                    allowJoin={event.allowJoin}
                    runningState={event.runningState}
                    registrationStatus={event.participantRegistrations?.[session.user.id]}
                    preRegistration={event.preRegistration}
                    waitlist={viewerWaitlist}
                    waitlistOpen={isWaitlistOpen(event, now)}
                    waitlistCount={waitlistCount}
                  />
                  <FavoriteButton
                    eventId={event.id}
                    initialIsFavorited={isFavorited}
                  />
                </div>
              ) : (
                <Button asChild className="w-full">
                  <Link href={`/login?redirect=/events/${event.id}`}>
                    {t("sections.loginToJoin")}
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm transition-colors hover:bg-accent"
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block font-medium">
                  {event.lair ? t("externalLink.lairSite") : t("externalLink.eventSite")}
                </span>
                {externalHost && (
                  <span className="block truncate text-xs text-muted-foreground">{externalHost}</span>
                )}
              </span>
            </a>
          )}

          {isCreator && (
            <Card className="gap-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Settings className="h-4 w-4" />
                  {t("sections.settings")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <AllowJoinSwitch
                  eventId={event.id}
                  initialAllowJoin={event.allowJoin ?? true}
                />
                <PreRegistrationSwitch
                  eventId={event.id}
                  initialPreRegistration={event.preRegistration ?? false}
                />
                <RunningStateManager
                  eventId={event.id}
                  runningState={event.runningState}
                />
                <QRCodeButton eventId={event.id} />
                <div className="pt-4 border-t space-y-2">
                  {event.status !== "cancelled" && (
                    <CancelEventButton
                      eventId={event.id}
                      eventName={event.name}
                      disabled={event.runningState === "completed"}
                    />
                  )}
                  <DeleteEventButton
                    eventId={event.id}
                    eventName={event.name}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>

      {(isCreator || canManage || isLairOwner) && (
        <section className="space-y-4 rounded-xl border bg-muted/30 p-4 sm:p-6">
          <h2 className="text-lg font-semibold">{t("sections.organization")}</h2>
          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            {isCreator && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Users className="h-4 w-4" />
                    {t("sections.participants")}
                  </CardTitle>
                  <CardDescription>
                    {event.maxParticipants
                      ? t("participantsCountWithMax", { count: registeredCount, max: event.maxParticipants })
                      : t("participantsCount", { count: registeredCount })}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ParticipantManagerWrapper
                    eventId={event.id}
                    participants={allParticipants as Participant[]}
                    runningState={event.runningState}
                    preRegistration={event.preRegistration}
                  />
                </CardContent>
              </Card>
            )}
            <div className="space-y-6">
              {isCreator && event.maxParticipants && (
                <WaitlistManager
                  eventId={event.id}
                  entries={waitlistEntries}
                  responseHours={responseHoursOf(event)}
                  now={now.toISOString()}
                />
              )}
              <InterestedUsers event={event} />
            </div>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Joueurs qui ont mis l'événement en favori, pour l'organisation et les
 * gérants du lieu : ce que montrait la fenêtre de détails de l'agenda.
 */
async function InterestedUsers({ event }: { event: Event }) {
  const t = await getTranslations("EventDetail.interested");
  // Une seule lecture pour tous les intéressés affichés.
  const users = await getUsersByIds((event.favoritedBy ?? []).slice(0, 50)).catch(() => []);

  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Star className="h-4 w-4" />
          {t("title", { count: event.favoritedBy?.length ?? 0 })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {users.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {users.map((user) => (
              <li key={user.id}>
                <Link href={`/users/${user.displayName}${user.discriminator}`}>
                  <Badge variant="outline" className="hover:bg-accent">
                    {user.displayName ? `${user.displayName}#${user.discriminator}` : user.username}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
