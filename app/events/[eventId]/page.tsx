import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Calendar,
  MapPin,
  Users,
  ExternalLink,
  Euro,
  Clock,
  Gamepad2,
  Info,
  Lock,
  CheckCircle,
  AlertCircle as AlertCircleIcon,
  Settings,
  InfoIcon
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import EventActions from "./EventActions";
import QRCodeButton from "./QRCodeButton";
import ParticipantManagerWrapper from "./ParticipantManagerWrapper";
import { type Participant } from "./AddParticipantForm";
import FavoriteButton from "./FavoriteButton";
import AllowJoinSwitch from "./AllowJoinSwitch";
import PreRegistrationSwitch from "./PreRegistrationSwitch";
import RunningStateManager from "./RunningStateManager";
import CancelEventButton from "./CancelEventButton";
import DeleteEventButton from "./DeleteEventButton";
import { DateTime } from "luxon";
import { getEventParticipants } from "./portal/participant-actions";
import ReactMarkdown from "react-markdown";
import { getLocale, getTranslations } from "next-intl/server";

type EventPageProps = {
  params: Promise<{
    eventId: string;
  }>;
  searchParams: Promise<{
    joined?: string;
    error?: string;
  }>;
};

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const { eventId } = await params;
  const search = await searchParams;
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const locale = await getLocale();
  const t = await getTranslations("EventDetail");

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  // Vérifier si l'événement est privé et si l'utilisateur a accès
  const isPrivateEvent = !event.lairId;
  const isCreator = session?.user && event.creatorId === session.user.id;
  const isOrganizerStaff = session?.user && event.staff?.some(
    (s) => s.userId === session.user.id && s.role === "organizer"
  );
  const isParticipant = session?.user && event.participants?.includes(session.user.id);
  const hasAccess = !isPrivateEvent || isCreator || isParticipant;

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            {t("privateEvent.title")}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const startDate = DateTime.fromISO(event.startDateTime, { locale });
  const endDate = DateTime.fromISO(event.endDateTime, { locale });
  const isFavorited = session?.user && event.favoritedBy?.includes(session.user.id);

  // Récupérer les participants (utilisateurs et invités)
  const participantsResult = isCreator
    ? await getEventParticipants(event.id)
    : { success: true, data: [] };

  const allParticipants = participantsResult.success && participantsResult.data
    ? participantsResult.data
    : [];

  const registeredCount = allParticipants.filter((p) => p.registrationStatus === "REGISTERED").length;
  const isFull = event.maxParticipants ? registeredCount >= event.maxParticipants : false;

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="space-y-6">
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

        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{event.name}</h1>
              {isPrivateEvent && (
                <Badge variant="secondary">
                  <Lock className="h-3 w-3 mr-1" />
                  {t("privateBadge")}
                </Badge>
              )}
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
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Gamepad2 className="h-4 w-4" />
              <span>{event.gameName}</span>
            </div>
          </div>
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
        </div>

        {isPrivateEvent && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t("privateEvent.description")}
            </AlertDescription>
          </Alert>
        )}

        {/* Boutons d'accès aux portails */}
        {(isCreator || isParticipant) && (
          <div className="flex gap-4">
            {(isCreator || isOrganizerStaff) && (
              <Button asChild className="flex-1">
                <Link href={`/events/${event.id}/portal/organizer`}>
                  <Settings className="h-4 w-4 mr-2" />
                  {t("portalButtons.organizer")}
                </Link>
              </Button>
            )}
            {isParticipant && (
              <Button asChild variant="outline" className="flex-1">
                <Link href={`/events/${event.id}/portal/player`}>
                  <Users className="h-4 w-4 mr-2" />
                  {t("portalButtons.player")}
                </Link>
              </Button>
            )}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t("sections.dateTime")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t("sections.start")}</p>
                    <p className="text-sm text-muted-foreground">
                      {startDate.toLocaleString(DateTime.DATETIME_FULL)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{t("sections.end")}</p>
                    <p className="text-sm text-muted-foreground">
                      {endDate.toLocaleString(DateTime.DATETIME_FULL)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {event.lair && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {t("sections.location")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link href={`/lairs/${event.lair.id}`} className="hover:underline">
                    <p className="font-medium">{event.lair.name}</p>
                  </Link>
                  {event.lair.address && (
                    <p className="text-sm text-muted-foreground mt-1">{event.lair.address}</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <InfoIcon className="h-5 w-5" />
                  {t("sections.description")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{event.description}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>

            {event.url && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5" />
                    {t("sections.link")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {t("sections.moreInfo")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Euro className="h-5 w-5" />
                  {t("sections.price")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {(event.price === 0 || !event.price) ? t("priceFree") : `${event.price.toFixed(2)} €`}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  {t("sections.participants")}
                </CardTitle>
                <CardDescription>
                  {event.maxParticipants
                    ? t("participantsCountWithMax", { count: registeredCount, max: event.maxParticipants })
                    : t("participantsCount", { count: registeredCount })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isCreator ? (
                  <ParticipantManagerWrapper
                    eventId={event.id}
                    participants={allParticipants as Participant[]}
                    runningState={event.runningState}
                    preRegistration={event.preRegistration}
                  />
                ) : null}

                {isCreator && (
                  <AllowJoinSwitch
                    eventId={event.id}
                    initialAllowJoin={event.allowJoin ?? true}
                  />
                )}

                {isCreator && (
                  <PreRegistrationSwitch
                    eventId={event.id}
                    initialPreRegistration={event.preRegistration ?? false}
                  />
                )}

                {isCreator && (
                  <RunningStateManager
                    eventId={event.id}
                    runningState={event.runningState}
                  />
                )}

                {session?.user && (
                  <div className="space-y-2">
                    <EventActions
                      eventId={event.id}
                      isParticipant={isParticipant || false}
                      isCreator={isCreator || false}
                      isFull={isFull}
                      allowJoin={event.allowJoin}
                      runningState={event.runningState}
                    />
                    <FavoriteButton
                      eventId={event.id}
                      initialIsFavorited={isFavorited || false}
                    />

                    {isCreator && (
                      <QRCodeButton eventId={event.id} />
                    )}
                  </div>
                )}

                {isCreator && (
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
                )}

                {!session?.user && (
                  <Button asChild className="w-full">
                    <Link href={`/login?redirect=/events/${event.id}`}>
                      {t("sections.loginToJoin")}
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
