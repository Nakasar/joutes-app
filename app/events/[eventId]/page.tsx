import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getEventById } from "@/lib/db/events";
import { getUserById } from "@/lib/db/users";
import { User } from "@/lib/types/User";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, Users, ExternalLink, Euro, Clock, Gamepad2, Info, Lock, CheckCircle, AlertCircle as AlertCircleIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import EventActions from "./EventActions";
import QRCodeButton from "./QRCodeButton";
import ParticipantManager from "./ParticipantManager";
import { DateTime } from "luxon";

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

  const event = await getEventById(eventId);

  if (!event) {
    notFound();
  }

  // Vérifier si l'événement est privé et si l'utilisateur a accès
  const isPrivateEvent = !event.lairId;
  const isCreator = session?.user && event.creatorId === session.user.id;
  const isParticipant = session?.user && event.participants?.includes(session.user.id);
  const hasAccess = !isPrivateEvent || isCreator || isParticipant;

  if (!hasAccess) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertDescription>
            Cet événement est privé. Seul le créateur et les participants peuvent y accéder.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const startDate = DateTime.fromISO(event.startDateTime);
  const endDate = DateTime.fromISO(event.endDateTime);
  const isFull = event.maxParticipants ? (event.participants?.length || 0) >= event.maxParticipants : false;

  // Récupérer les informations des participants
  const participantUsers = event.participants
    ? await Promise.all(
        event.participants.map(async (userId) => {
          const user = await getUserById(userId);
          return user;
        })
      )
    : [];

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="space-y-6">
        {search.joined && (
          <Alert className="border-green-500 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Vous êtes maintenant inscrit à cet événement !
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
                  Privé
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
            {event.status === "available" && "Disponible"}
            {event.status === "sold-out" && "Complet"}
            {event.status === "cancelled" && "Annulé"}
          </Badge>
        </div>

        {isPrivateEvent && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Cet événement est privé et n&apos;est pas rattaché à un lieu. Il est visible uniquement par le créateur et les participants.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Date et heure
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Début</p>
                    <p className="text-sm text-muted-foreground">
                      {startDate.setLocale('fr').toLocaleString(DateTime.DATETIME_FULL)}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Fin</p>
                    <p className="text-sm text-muted-foreground">
                      {endDate.setLocale('fr').toLocaleString(DateTime.DATETIME_FULL)}
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
                    Lieu
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

            {event.url && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ExternalLink className="h-5 w-5" />
                    Lien
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <a
                    href={event.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    Voir plus d&apos;informations
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {event.price && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Euro className="h-5 w-5" />
                    Prix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">
                    {event.price === 0 ? "Gratuit" : `${event.price.toFixed(2)} €`}
                  </p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Participants
                </CardTitle>
                <CardDescription>
                  {event.participants?.length || 0}
                  {event.maxParticipants && ` / ${event.maxParticipants}`} inscrit(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isCreator ? (
                  <ParticipantManager
                    eventId={event.id}
                    participants={participantUsers.filter(Boolean) as User[]}
                  />
                ) : participantUsers.length > 0 ? (
                  <div className="space-y-2">
                    {participantUsers.filter(Boolean).map((user) => (
                      <div key={user!.id} className="flex items-center gap-2">
                        {user!.profileImage && (
                          <img
                            src={user!.profileImage}
                            alt={user!.displayName || user!.username}
                            className="h-6 w-6 rounded-full"
                          />
                        )}
                        <Link
                          href={`/users/${user!.displayName}${user!.discriminator}`}
                          className="text-sm hover:underline"
                        >
                          {user!.displayName || user!.username}
                          {user!.discriminator && `#${user!.discriminator}`}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : null}

                {session?.user && (
                  <div className="space-y-2">
                    <EventActions
                      eventId={event.id}
                      isParticipant={isParticipant || false}
                      isCreator={isCreator || false}
                      isFull={isFull}
                    />
                    {isCreator && (
                      <QRCodeButton eventId={event.id} />
                    )}
                  </div>
                )}

                {!session?.user && (
                  <Button asChild className="w-full">
                    <Link href={`/login?redirect=/events/${event.id}`}>
                      Se connecter pour s&apos;inscrire
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
