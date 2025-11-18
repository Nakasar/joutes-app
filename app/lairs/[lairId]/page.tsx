import { getLairById } from "@/lib/db/lairs";
import { getEventsByLairId } from "@/lib/db/events";
import { getGameById } from "@/lib/db/games";
import { getUserById } from "@/lib/db/users";
import { auth } from "@/lib/auth";
import { checkAdminOrOwner } from "@/lib/middleware/admin";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Metadata } from "next";
import FollowLairButton from "./FollowLairButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Gamepad2, Calendar, Settings } from "lucide-react";
import EventsCalendarClient from "@/components/EventsCalendarClient";

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
  params,
  searchParams,
}: { 
  params: Promise<{ lairId: string }>;
  searchParams: Promise<{
    month?: string;
    year?: string;
    allGames?: string;
  }>;
}) {
  const { lairId } = await params;
  const { month, year, allGames } = await searchParams;
  const lair = await getLairById(lairId);

  if (!lair) {
    notFound();
  }

  // Vérifier si l'utilisateur est connecté et s'il suit ce lair
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  
  const user = session?.user?.id ? await getUserById(session.user.id) : null;
  const isFollowing = user?.lairs?.includes(lairId) || false;
  const hasGames = user?.games && user.games.length > 0;

  // Vérifier si l'utilisateur est administrateur ou owner du lair
  const canManageLair = await checkAdminOrOwner(lairId);

  const upcomingEvents = await getEventsByLairId(lairId, {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    userId: session?.user?.id,
  });
  
  // Récupérer les détails des jeux
  const gamesDetails = await Promise.all(
    lair.games.map(async (gameId) => {
      const game = await getGameById(gameId);
      return game;
    })
  );
  const games = gamesDetails.filter((game): game is NonNullable<typeof game> => game !== null);

  return (
    <div className="min-h-screen">
      {/* Bannière */}
      <div className="relative w-full h-64 md:h-96 bg-gradient-to-br from-primary/80 to-purple-600/80">
        {lair.banner ? (
          <img
            src={lair.banner}
            alt={lair.name}
            className="absolute inset-0 w-full h-full object-cover object-center"
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
              {canManageLair && (
                <Button variant="default" asChild size="sm">
                  <Link href={`/lairs/${lairId}/manage`}>
                    <Settings className="mr-2 h-4 w-4" />
                    Gérer
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Informations du lieu */}
        {(lair.address || lair.website || lair.location) && (
          <div className="mb-8 p-6 bg-card rounded-lg border">
            <h2 className="text-xl font-semibold mb-4">Informations pratiques</h2>
            <div className="space-y-3">
              {lair.address && (
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Adresse :</span>
                  <span className="text-sm">{lair.address}</span>
                </div>
              )}
              {lair.website && (
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Site web :</span>
                  <a 
                    href={lair.website} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {lair.website}
                  </a>
                </div>
              )}
              {lair.location && (
                <div className="flex items-start gap-3">
                  <span className="text-sm font-medium text-muted-foreground min-w-[100px]">Coordonnées :</span>
                  <a
                    href={`https://www.google.com/maps?q=${lair.location.coordinates[1]},${lair.location.coordinates[0]}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    {lair.location.coordinates[1]}, {lair.location.coordinates[0]} (voir sur la carte)
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section Jeux disponibles */}
        {games.length > 0 && (
          <div className="mb-12">
            <div className="mb-6">
              <h2 className="text-3xl font-bold flex items-center gap-3">
                <Gamepad2 className="h-8 w-8" />
                Jeux disponibles
              </h2>
              <p className="text-muted-foreground mt-2">
                {games.length} jeu{games.length > 1 ? 'x' : ''} disponible{games.length > 1 ? 's' : ''} dans ce lieu
              </p>
            </div>
            
            <div className="relative">
              <div className="flex gap-6 overflow-x-auto pb-6 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-transparent hover:scrollbar-thumb-gray-500">
                {games.map((game) => (
                  <div
                    key={game.id}
                    className="relative flex-shrink-0 w-80 h-48 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 cursor-pointer snap-start group"
                  >
                    {/* Image de fond : bannière ou dégradé */}
                    <div className="absolute inset-0">
                      {game.banner ? (
                        <Image
                          src={game.banner}
                          alt={game.name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 100vw, 320px"
                        />
                      ) : (
                        <div className="absolute inset-0 bg-linear-to-br from-blue-600 via-blue-500 to-amber-500" />
                      )}
                    </div>

                    {/* Overlay sombre pour améliorer la lisibilité */}
                    <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-transparent group-hover:from-black/90 transition-colors duration-300" />

                    {/* Contenu */}
                    <div className="relative h-full flex flex-col justify-between p-6">
                      {/* Logo en haut si disponible */}
                      {game.icon && (
                        <div className="flex justify-start">
                          <div className="relative w-20 h-20 bg-white/10 backdrop-blur-sm rounded-lg p-2 shadow-xl">
                            <Image
                              src={game.icon}
                              alt={game.name}
                              fill
                              className="object-contain p-1"
                            />
                          </div>
                        </div>
                      )}

                      {/* Informations en bas */}
                      <div className="space-y-2">
                        <h3 className="font-bold text-2xl text-white drop-shadow-lg">
                          {game.name}
                        </h3>
                        <Badge 
                          variant="secondary" 
                          className="bg-white/20 text-white backdrop-blur-sm border-white/30 hover:bg-white/30"
                        >
                          {game.type}
                        </Badge>
                        {game.description && (
                          <p className="text-sm text-white/90 line-clamp-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                            {game.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Indicateur hover subtil */}
                    <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <Gamepad2 className="h-4 w-4 text-white" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Gradient fade sur les bords pour l'effet carousel */}
              {games.length > 3 && (
                <>
                  <div className="absolute left-0 top-0 bottom-6 w-12 bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
                  <div className="absolute right-0 top-0 bottom-6 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
                </>
              )}
            </div>
          </div>
        )}

        {/* Section Événements à venir */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-3xl flex items-center gap-2">
                  <Calendar className="h-8 w-8" />
                  Événements à venir
                </CardTitle>
              </div>
              {canManageLair && (
                <Button asChild>
                  <Link href={`/lairs/${lairId}/events/new`}>
                    <Calendar className="mr-2 h-4 w-4" />
                    Ajouter un événement
                  </Link>
                </Button>
              )}
            </div>
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
              <div>
                {!hasGames && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <Gamepad2 className="h-8 w-8 text-primary mb-2" />
                        <CardTitle>Suivez des jeux</CardTitle>
                        <CardDescription>
                          Sélectionnez les jeux qui vous intéressent pour voir leurs événements
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button asChild className="w-full">
                          <Link href="/account">
                            Gérer mes jeux
                          </Link>
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
                <EventsCalendarClient
                  initialEvents={upcomingEvents}
                  initialMonth={+(month ?? new Date().getMonth() + 1)}
                  initialYear={+(year ?? new Date().getFullYear())}
                  initialShowAllGames={allGames === "true"}
                  basePath={`/lairs/${lairId}`}
                  lairId={lairId}
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
