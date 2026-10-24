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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
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
  ImageIcon,
  Pencil,
} from "lucide-react";
import { Link } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import EventActions from "./EventActions.tsx";
import { type Participant } from "./AddParticipantForm.tsx";
import FavoriteButton from "./FavoriteButton.tsx";
import AllowJoinSwitch from "./AllowJoinSwitch.tsx";
import PreRegistrationSwitch from "./PreRegistrationSwitch.tsx";
import RunningStateManager from "./RunningStateManager.tsx";
import { EventTournamentSection } from "./EventTournamentSection.tsx";
import EventAnnouncements from "./EventAnnouncements.tsx";
import { EventRelatedSection } from "./EventRelatedSection.tsx";
import EventAttendees from "./EventAttendees.tsx";
import EventManageTabs from "./EventManageTabs.tsx";
import EventManageMenu from "./EventManageMenu.tsx";
import EventShareButton from "./EventShareButton.tsx";
import { EventBanner } from "../EventBanner.tsx";
import ReportButton from "@/components/ReportButton.tsx";
import { DateTime } from "luxon";
import { getEventParticipants, getEventWaitlist } from "./portal/participant-actions.ts";
import { getAnnouncements } from "./portal/actions.ts";
import { getEventAttendeesAction } from "../actions.ts";
import WaitlistOfferBanner from "./WaitlistOfferBanner.tsx";
import WaitlistManager, { type WaitlistManagerEntry } from "./WaitlistManager.tsx";
import { canJoinDirectly, isWaitlistOpen, responseHoursOf, viewerWaitlistStatus } from "@/lib/events/waitlist.ts";
import { canSeeAttendees, initials } from "@/lib/events/attendees.ts";
import { readEventManageState } from "@/lib/events/manage-state.ts";
import { toURLSearchParams } from "@/lib/navigation/url-query.ts";
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
    [key: string]: string | string[] | undefined;
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
      ...(event.banner ? { images: [event.banner] } : {}),
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
 * La personne connectée, lue une fois par rendu : l'en-tête en a besoin pour
 * ses boutons d'organisation, le corps pour tout le reste.
 */
const readViewer = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
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
 * Deux frontières : l'en-tête — bannière, date, titre — ne tient qu'à
 * l'événement, quand le corps demande en plus la session, le tournoi associé,
 * les annonces et les inscrits. Les boutons de l'en-tête, qui dépendent de qui
 * regarde, ont leur propre frontière. L'organisation retrouve tout le reste
 * dans des onglets : aperçu, inscrits, liste d'attente, intéressés.
 */
export default function EventPage({ params, searchParams }: EventPageProps) {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-6xl">
      <div className="space-y-6">
        <Suspense fallback={<EventDetailSkeleton section="header" />}>
          <EventHeader params={params} searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<EventDetailSkeleton section="body" />}>
          <EventBody params={params} searchParams={searchParams} />
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
    <div className="space-y-3">
      {search.joined && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            {t("joined")}
          </AlertDescription>
        </Alert>
      )}
      {typeof search.error === "string" && (
        <Alert variant="destructive">
          <AlertCircleIcon className="h-4 w-4" />
          <AlertDescription>
            {decodeURIComponent(search.error)}
          </AlertDescription>
        </Alert>
      )}

      <EventBanner src={event.banner ?? event.game?.banner} alt={t("banner.alt", { name: event.name })} className="max-h-72">
        <Suspense fallback={null}>
          <BannerEditLink event={event} />
        </Suspense>
      </EventBanner>

      <div className="relative -mt-10 flex items-end gap-3 px-3 sm:-mt-12 sm:gap-4 sm:px-5">
        {/* Le repère de calendrier : jour, mois, jour de la semaine. */}
        <div className="w-[72px] shrink-0 overflow-hidden rounded-xl border bg-card text-center shadow-lg sm:w-[84px]" aria-hidden>
          <div className="bg-primary py-0.5 text-[11px] font-semibold uppercase tracking-widest text-primary-foreground">
            {start.toFormat("LLL")}
          </div>
          <div className="pt-1 text-[28px] font-bold leading-tight tabular-nums sm:text-[32px]">{start.toFormat("d")}</div>
          <div className="pb-1.5 text-xs text-muted-foreground">{start.toFormat("cccc")}</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 pb-1">
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
        <Suspense fallback={null}>
          <EventHeaderActions event={event} />
        </Suspense>
      </div>

      <h1 className="pt-1 text-2xl font-bold tracking-tight [text-wrap:balance] sm:text-[34px] sm:leading-tight">{event.name}</h1>
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
  );
}

/** « Changer la bannière », posé sur la bannière, pour l'organisation seule. */
async function BannerEditLink({ event }: { event: Event }) {
  const [viewer, t] = await Promise.all([readViewer(), getTranslations("EventDetail.banner")]);
  if (!canManageEvent(event, viewer?.id)) return null;

  return (
    <Button asChild size="sm" variant="secondary" className="absolute bottom-3 right-3 bg-background/80 backdrop-blur hover:bg-background">
      <Link href={`/events/${event.id}/edit`}>
        <ImageIcon className="h-4 w-4 mr-2" />
        {event.banner ? t("change") : t("add")}
      </Link>
    </Button>
  );
}

/**
 * Les boutons de l'en-tête : modifier et le menu « … » pour l'organisation,
 * partager pour tous, signaler pour les autres.
 */
async function EventHeaderActions({ event }: { event: Event }) {
  const [viewer, t] = await Promise.all([readViewer(), getTranslations("EventDetail.manage")]);
  const canManage = canManageEvent(event, viewer?.id);

  return (
    <div className="flex shrink-0 items-center gap-2 pb-1">
      {canManage && (
        <Button asChild>
          <Link href={`/events/${event.id}/edit`}>
            <Pencil className="h-4 w-4 sm:mr-2" />
            <span className="sr-only sm:not-sr-only">{t("edit")}</span>
          </Link>
        </Button>
      )}
      <EventShareButton eventName={event.name} />
      {canManage ? (
        <EventManageMenu
          eventId={event.id}
          eventName={event.name}
          canCancel={event.status !== "cancelled" && event.runningState !== "completed"}
        />
      ) : (
        <ReportButton contentType="event" contentId={event.id} variant="outline" size="icon" />
      )}
    </div>
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

async function EventBody({ params, searchParams }: EventPageProps) {
  const { eventId } = await params;
  const [{ event, isPrivateEvent, hasAccess }, t, locale, search] = await Promise.all([
    readEventAccess(eventId),
    getTranslations("EventDetail"),
    getLocale(),
    searchParams,
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

  const viewer = await readViewer();
  const viewerId = viewer?.id ?? null;
  const isCreator = Boolean(viewerId && event.creatorId === viewerId);
  // Créateur ou staff organisateur : réglages, inscrits, annonces, tournoi
  // associé, ancien portail — comme le vérifient leurs actions serveur.
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
  // La liste complète — statuts, e-mails, invités — ne sert qu'à
  // l'organisation : personne d'autre ne la charge.
  const participantsResult = canManage
    ? await getEventParticipants(event.id)
    : { success: true, data: [] };
  const allParticipants = participantsResult.success && participantsResult.data
    ? participantsResult.data
    : [];
  // Le compte vient de l'événement, pas de la liste : elle n'est chargée que
  // pour l'organisation, et tout le monde doit lire le même remplissage.
  const registeredCount = event.registeredParticipantsCount ?? 0;
  // « Qui vient ? » : la première page arrive avec la page, si la visibilité
  // choisie par l'organisation l'ouvre à qui regarde.
  const attendeesVisible = canSeeAttendees(event.participantsVisibility, { isManager: canManage, isParticipant });
  const attendeesResult = attendeesVisible ? await getEventAttendeesAction(event.id) : null;
  const attendees = attendeesResult?.success
    ? { items: attendeesResult.items, total: attendeesResult.total, page: attendeesResult.page, pageCount: attendeesResult.pageCount }
    : null;
  // Liste d'attente : « complet » tient compte des places réservées aux
  // offres en cours et des joueurs qui attendent déjà (cf. lib/events/waitlist).
  const now = new Date();
  const isFull = !canJoinDirectly(event, now);
  const waitlistCount = event.waitlist?.length ?? 0;
  const viewerWaitlist = viewerId ? viewerWaitlistStatus(event, viewerId, now) : null;
  const waitlistResult = canManage && event.maxParticipants
    ? await getEventWaitlist(event.id)
    : { success: true, data: [] };
  const waitlistEntries: WaitlistManagerEntry[] = waitlistResult.success && waitlistResult.data
    ? waitlistResult.data
    : [];
  const fillRatio = event.maxParticipants
    ? Math.min(1, registeredCount / event.maxParticipants)
    : null;
  const externalHost = event.url ? hostnameOf(event.url) : null;
  const creatorName = event.creator?.displayName
    ? `${event.creator.displayName}${event.creator.discriminator ? `#${event.creator.discriminator}` : ""}`
    : null;

  const overview = (
    <div className="grid gap-7 lg:grid-cols-3 lg:items-start">
      <div className="min-w-0 space-y-9 lg:col-span-2">
        {event.description ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t("sections.about")}</h2>
              {canManage && (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/events/${event.id}/edit`}>{t("manage.edit")}</Link>
                </Button>
              )}
            </div>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{event.description}</ReactMarkdown>
            </div>
          </section>
        ) : canManage ? (
          <Link
            href={`/events/${event.id}/edit`}
            className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4 shrink-0" />
            {t("manage.addDescription")}
          </Link>
        ) : null}
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
        <EventAttendees
          eventId={event.id}
          count={registeredCount}
          initial={attendees}
          hidden={attendeesVisible || event.participantsVisibility === "public" ? undefined : event.participantsVisibility}
          viewerId={viewerId}
        />
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
        {isLairOwner && <InterestedUsers event={event} />}
      </div>

      <aside className="order-first space-y-4 lg:order-none lg:sticky lg:top-20">
        <Card className="gap-4 rounded-2xl">
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
                  <div className="h-full rounded-full bg-primary" style={{ width: `${fillRatio * 100}%` }} />
                </div>
              )}
              <p className="flex flex-wrap justify-between gap-x-2 text-sm">
                <span>
                  {event.maxParticipants
                    ? t("participantsCountWithMax", { count: registeredCount, max: event.maxParticipants })
                    : t("participantsCount", { count: registeredCount })}
                </span>
                {waitlistCount > 0 ? (
                  <span className="text-muted-foreground">{t("waitlist.count", { count: waitlistCount })}</span>
                ) : event.maxParticipants && event.maxParticipants > registeredCount ? (
                  <span className="text-muted-foreground">
                    {t("spotsLeft", { count: event.maxParticipants - registeredCount })}
                  </span>
                ) : null}
              </p>
            </div>
            {viewer ? (
              <div className="space-y-2">
                <EventActions
                  eventId={event.id}
                  isParticipant={isParticipant}
                  isCreator={isCreator}
                  isFull={isFull}
                  allowJoin={event.allowJoin}
                  runningState={event.runningState}
                  registrationStatus={event.participantRegistrations?.[viewer.id]}
                  registeredAt={event.participantRegisteredAt?.[viewer.id]}
                  preRegistration={event.preRegistration}
                  waitlist={viewerWaitlist}
                  waitlistOpen={isWaitlistOpen(event, now)}
                  waitlistCount={waitlistCount}
                  calendar={{
                    name: event.name,
                    startDateTime: event.startDateTime,
                    endDateTime: event.endDateTime,
                    location: event.lair
                      ? [event.lair.name, event.lair.address].filter(Boolean).join(", ")
                      : undefined,
                  }}
                />
                <FavoriteButton
                  eventId={event.id}
                  initialIsFavorited={isFavorited}
                />
              </div>
            ) : (
              <Button asChild className="h-11 w-full text-base font-semibold">
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
        {(event.lair || creatorName) && (
          <div className="space-y-2.5 rounded-2xl border bg-card px-4 py-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("organizedBy")}</p>
            <div className="flex items-center gap-2.5">
              <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-sm font-bold uppercase text-primary">
                {initials(event.lair?.name ?? creatorName ?? "") || "?"}
              </span>
              <div className="min-w-0 text-sm">
                {event.lair ? (
                  <Link href={`/lairs/${event.lair.id}`} className="block truncate font-semibold hover:underline">
                    {event.lair.name}
                  </Link>
                ) : (
                  <span className="block truncate font-semibold">{creatorName}</span>
                )}
                {event.lair && creatorName && (
                  <span className="block truncate text-xs text-muted-foreground">{t("organizedWith", { name: creatorName })}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );

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

      {canManage ? (
        <>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-2xl border bg-card px-4 py-3.5 sm:px-5">
            <AllowJoinSwitch
              eventId={event.id}
              initialAllowJoin={event.allowJoin ?? true}
            />
            <PreRegistrationSwitch
              eventId={event.id}
              initialPreRegistration={event.preRegistration ?? false}
            />
            <div className="text-sm">
              <p className="font-semibold">{t("manage.places")}</p>
              <p className="text-xs text-muted-foreground">
                {event.maxParticipants
                  ? t("participantsCountWithMax", { count: registeredCount, max: event.maxParticipants })
                  : t("participantsCount", { count: registeredCount })}
                {waitlistCount > 0 && <> · {t("waitlist.count", { count: waitlistCount })}</>}
              </p>
            </div>
            <div className="sm:ml-auto">
              <RunningStateManager
                eventId={event.id}
                runningState={event.runningState}
              />
            </div>
          </div>
          <EventManageTabs
            initialState={readEventManageState(toURLSearchParams(search))}
            counts={{
              participants: allParticipants.length,
              waitlist: waitlistCount,
              interested: event.favoritedBy?.length ?? 0,
            }}
            overview={overview}
            waitlist={event.maxParticipants ? (
              <div className="max-w-3xl">
                <WaitlistManager
                  eventId={event.id}
                  entries={waitlistEntries}
                  responseHours={responseHoursOf(event)}
                  now={now.toISOString()}
                />
              </div>
            ) : undefined}
            interested={<div className="max-w-3xl"><InterestedUsers event={event} /></div>}
            participants={{
              eventId: event.id,
              list: allParticipants as Participant[],
              runningState: event.runningState,
              preRegistration: event.preRegistration,
            }}
          />
        </>
      ) : (
        overview
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
