import { getAllGames } from "@/lib/db/games";
import EventsCalendarClient from "@/components/EventsCalendarClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, Gamepad2, AlertCircle, Info, Plus } from "lucide-react";
import { DateTime } from "luxon";
import { Event } from "@/lib/types/Event";
import {getTranslations} from "next-intl/server";
import { connection } from "next/server";

type EventsCalendarWrapperProps = {
  basePath?: string;
  /**
   * La promesse, pas sa valeur : la page la transmet sans l'attendre, pour que
   * la lecture de l'URL ait lieu ici, sous la frontière `<Suspense>`. L'attendre
   * en tête de page ferait sortir tout le reste de la coquille statique.
   */
  searchParams?: Promise<{
    month?: string;
    year?: string;
    gameId?: string;
  }>;
};

export default async function EventsCalendarWrapper({
  basePath = "/",
  searchParams,
}: EventsCalendarWrapperProps) {
  // Le calendrier s'ouvre sur le mois courant et sur les jeux que le visiteur
  // suit : sa date et sa session ne se prérendent pas. Il rend donc à la
  // requête, et c'est la frontière `<Suspense>` de la page qui garde la
  // coquille statique.
  await connection();

  const t = await getTranslations('EventsCalendar');

  const params = (await searchParams) ?? {};

  const today = DateTime.now();

  // Parse search params
  const month = params.month ? parseInt(params.month, 10) : today.month;
  const year = params.year ? parseInt(params.year, 10) : today.year;
  // Par défaut, afficher les jeux suivis
  const gameId = params.gameId || "followed";
  
  // Récupérer tous les jeux disponibles
  const allGames = await getAllGames();
  
  // Récupérer la session utilisateur
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Si l'utilisateur n'est pas connecté, afficher le calendrier avec uniquement la fonction de localisation
  if (!session?.user) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          <div className="text-center space-y-4 py-12">
            <Calendar className="h-16 w-16 mx-auto text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">
              {t('title')}
            </h1>
            <p className="text-xl text-muted-foreground">
              {t('description')}
            </p>
          </div>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {t('cta')}
            </AlertDescription>
          </Alert>

          <EventsCalendarClient
            initialEvents={[]}
            initialMonth={month}
            initialYear={year}
            initialGameId={gameId}
            availableGames={allGames}
            basePath={basePath}
          />
        </div>
      </div>
    );
  }

  // Récupérer les lairs suivis par l'utilisateur
  const user = await getUserById(session.user.id);
  
  if (!user) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('noUserError')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Vérifier si l'utilisateur suit des lieux et des jeux
  const hasLairs = user.lairs && user.lairs.length > 0;
  const hasGames = user.games && user.games.length > 0;

  // Récupérer les événements pour l'utilisateur avec le mois/année
  // Les détails des lairs sont maintenant inclus directement dans les événements
  const events: Event[] = [];

  return (
    <div className="space-y-6">
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            {!hasLairs && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <MapPin className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>{t('ctaFollowLairs.title')}</CardTitle>
                  <CardDescription>
                    {t('ctaFollowLairs.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/lairs">
                      {t('ctaFollowLairs.discoverLairs')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {!hasGames && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <Gamepad2 className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>{t('ctaFavoriteGames.title')}</CardTitle>
                  <CardDescription>
                    {t('ctaFavoriteGames.description')}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/account">
                      {t('ctaFavoriteGames.manageGames')}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <EventsCalendarClient
        initialMonth={month}
        initialYear={year}
        initialGameId={gameId}
        availableGames={allGames}
        basePath={basePath}
        userLocation={user.location}
      />
    </div>
  );
}
