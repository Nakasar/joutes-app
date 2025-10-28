import { getLairById } from "@/lib/db/lairs";
import { getEventsByLairId } from "@/lib/db/events";
import { getGameById } from "@/lib/db/games";
import { getUserById } from "@/lib/db/users";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import FollowLairButton from "./FollowLairButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Gamepad2, Calendar, Clock, Euro, MapPin } from "lucide-react";
import { DateTime } from "luxon";

export async function generateMetadata({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}): Promise<Metadata> {
  const { lairId } = await params;
  const lair = await getLairById(lairId);

  if (!lair) {
    return {
      title: 'Lieu non trouvé',
    };
  }

  return {
    title: `${lair.name} - Lieu de jeu`,
    description: `Découvrez ${lair.name} et ses événements à venir. ${lair.games.length} jeu(x) disponible(s).`,
    openGraph: {
      title: lair.name,
      description: `Découvrez ${lair.name} et ses événements à venir`,
      images: lair.banner ? [lair.banner] : [],
    },
  };
}

export default async function LairDetailPage({ 
  params 
}: { 
  params: Promise<{ lairId: string }> 
}) {
  const { lairId } = await params;
  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  // Vérifier si l'utilisateur est connecté et s'il suit ce lair
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  
  let isFollowing = false;
  if (session?.user?.id) {
    const user = await getUserById(session.user.id);
    isFollowing = user?.lairs?.includes(lairId) || false;
  }

  const upcomingEvents = await getEventsByLairId(lairId);
  
  // Récupérer les détails des jeux
  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => {
      const game = await getGameById(gameId);
      return game;
    })
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  // Formater la date
  const formatDate = (dateString: string) => {
    const date = DateTime.fromISO(dateString);
    return date.setLocale('fr').toLocaleString({
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Badge de statut
  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'available':
        return "default";
      case 'sold-out':
        return "destructive";
      case 'cancelled':
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Disponible';
      case 'sold-out':
        return 'Complet';
      case 'cancelled':
        return 'Annulé';
      default:
        return status;
    }
  };

  return (
    <div className="min-h-screen">
      {/* Bannière */}
      <div className="relative w-full h-64 md:h-96 bg-gradient-to-br from-primary/80 to-purple-600/80">
        {lair.banner ? (
          <Image
            src={lair.banner}
            alt={lair.name}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Gamepad2 className="h-24 w-24 text-white" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/40 flex items-end">
          <div className="container mx-auto px-4 py-8">
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-4">
              {lair.name}
            </h1>
            <div className="flex flex-wrap items-center gap-4">
              <Button variant="secondary" asChild size="sm">
                <Link href="/lairs">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Retour à la liste
                </Link>
              </Button>
              {session?.user && (
                <FollowLairButton
                  lairId={lairId}
                  isFollowing={isFollowing}
                  isAuthenticated={!!session?.user}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Section Jeux disponibles */}
        {games.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-3xl flex items-center gap-2">
                <Gamepad2 className="h-8 w-8" />
                Jeux disponibles
              </CardTitle>
              <CardDescription>
                {games.length} jeu{games.length > 1 ? 'x' : ''} disponible{games.length > 1 ? 's' : ''} dans ce lieu
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {games.map((game) => (
                  <Card key={game.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-3 mb-3">
                        {game.icon && (
                          <div className="relative w-12 h-12 flex-shrink-0">
                            <Image
                              src={game.icon}
                              alt={game.name}
                              fill
                              className="object-contain rounded"
                            />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="font-semibold text-lg truncate">{game.name}</h3>
                          <Badge variant="secondary">{game.type}</Badge>
                        </div>
                      </div>
                      {game.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {game.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Section Événements à venir */}
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl flex items-center gap-2">
              <Calendar className="h-8 w-8" />
              Événements à venir
            </CardTitle>
            <CardDescription>
              Tous les événements prévus dans ce lieu
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <div className="text-center py-12">
                <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground text-lg">
                  Aucun événement à venir pour le moment
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingEvents.map((event) => (
                  <Card 
                    key={event.id} 
                    className="hover:shadow-lg transition-all hover:-translate-y-0.5"
                  >
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="flex-1 space-y-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <h3 className="text-xl font-semibold">{event.name}</h3>
                            <Badge variant={getStatusVariant(event.status)}>
                              {getStatusLabel(event.status)}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              <span className="capitalize">{formatDate(event.startDateTime)}</span>
                            </div>
                            
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Clock className="h-4 w-4" />
                              <span>Fin : {formatDate(event.endDateTime)}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Gamepad2 className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{event.gameName}</span>
                            </div>
                          </div>
                        </div>
                        
                        {event.price !== undefined && (
                          <div className="flex items-center gap-2 md:flex-col md:text-right">
                            <Euro className="h-5 w-5 text-primary" />
                            <div className="text-3xl font-bold text-primary">
                              {event.price === 0 ? 'Gratuit' : `${event.price}€`}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
