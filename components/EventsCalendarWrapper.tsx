import { getEventsForUser } from "@/lib/db/events";
import EventsCalendarClient from "@/components/EventsCalendarClient";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, Gamepad2, AlertCircle, Info, Plus } from "lucide-react";
import { DateTime } from "luxon";

type EventsCalendarWrapperProps = {
  basePath?: string;
  searchParams?: {
    month?: string;
    year?: string;
    allGames?: string;
  };
};

export default async function EventsCalendarWrapper({ 
  basePath = "/",
  searchParams = {},
}: EventsCalendarWrapperProps) {
  const today = DateTime.now();
  
  // Parse search params
  const month = searchParams.month ? parseInt(searchParams.month, 10) : today.month;
  const year = searchParams.year ? parseInt(searchParams.year, 10) : today.year;
  // Par défaut, afficher tous les jeux si le paramètre n'est pas défini
  const showAllGames = searchParams.allGames !== undefined 
    ? searchParams.allGames === "true" 
    : false;
  
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
              Calendrier des Événements
            </h1>
            <p className="text-xl text-muted-foreground">
              Découvrez tous les événements de jeux près de chez vous
            </p>
          </div>
          
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Utilisez la fonction &quot;Proches de moi&quot; pour découvrir les événements à proximité de votre position.
              Connectez-vous pour personnaliser votre expérience et suivre vos lieux et jeux favoris.
            </AlertDescription>
          </Alert>

          <EventsCalendarClient
            initialEvents={[]}
            initialMonth={month}
            initialYear={year}
            initialShowAllGames={showAllGames}
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
        <h1 className="text-3xl font-bold mb-8">Calendrier des Événements</h1>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erreur lors de la récupération de votre profil.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Vérifier si l'utilisateur suit des lieux et des jeux
  const hasLairs = user.lairs && user.lairs.length > 0;
  const hasGames = user.games && user.games.length > 0;

  if (!hasLairs || !hasGames) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div className="text-center flex-1 space-y-2">
              <h1 className="text-4xl font-bold tracking-tight">
                Calendrier des Événements
              </h1>
              <p className="text-muted-foreground">
                Personnalisez votre expérience en suivant des lieux et des jeux
              </p>
            </div>
            <Button asChild>
              <Link href="/events/new">
                <Plus className="h-4 w-4 mr-2" />
                Créer un événement
              </Link>
            </Button>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              {!hasLairs && !hasGames && "Vous ne suivez aucun lieu ni aucun jeu pour le moment."}
              {!hasLairs && hasGames && "Vous ne suivez aucun lieu pour le moment."}
              {hasLairs && !hasGames && "Vous ne suivez aucun jeu pour le moment."}
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            {!hasLairs && (
              <Card className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <MapPin className="h-8 w-8 text-primary mb-2" />
                  <CardTitle>Suivez des lieux</CardTitle>
                  <CardDescription>
                    Découvrez les boutiques et espaces de jeu près de chez vous
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link href="/lairs">
                      Découvrir les lieux
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            
            {!hasGames && (
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
            )}
          </div>
        </div>
      </div>
    );
  }

  // Récupérer les événements pour l'utilisateur avec le mois/année
  // Les détails des lairs sont maintenant inclus directement dans les événements
  const events = await getEventsForUser(session.user.id, showAllGames, month, year);

  return (
    <div className="space-y-6">
      <EventsCalendarClient
        initialEvents={events}
        initialMonth={month}
        initialYear={year}
        initialShowAllGames={showAllGames}
        basePath={basePath}
      />
    </div>
  );
}
