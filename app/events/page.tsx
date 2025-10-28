import { getEventsByLairIds } from "@/lib/db/events";
import { getLairById } from "@/lib/db/lairs";
import { getAllGames } from "@/lib/db/games";
import { Event } from "@/lib/types/Event";
import { Lair } from "@/lib/types/Lair";
import EventsCalendar from "./EventsCalendar";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getUserById } from "@/lib/db/users";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Calendar, MapPin, Gamepad2, AlertCircle, Info } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  // Récupérer la session utilisateur
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  // Si l'utilisateur n'est pas connecté, afficher un message
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
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Vous devez être connecté pour voir les événements.
            </AlertDescription>
          </Alert>

          <Card className="border-primary/50">
            <CardHeader className="text-center">
              <CardTitle>Connectez-vous pour commencer</CardTitle>
              <CardDescription>
                Accédez à votre calendrier personnalisé d'événements
              </CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center pb-6">
              <Button size="lg" asChild>
                <Link href="/login">
                  Se connecter
                </Link>
              </Button>
            </CardContent>
          </Card>
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
          <div className="text-center space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">
              Calendrier des Événements
            </h1>
            <p className="text-muted-foreground">
              Personnalisez votre expérience en suivant des lieux et des jeux
            </p>
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

  // Récupérer tous les jeux pour obtenir leurs noms
  const allGames = await getAllGames();
  const followedGameNames = allGames
    .filter(game => user.games.includes(game.id))
    .map(game => game.name);

  // Récupérer les événements des lairs suivis
  const allEvents = await getEventsByLairIds(user.lairs);

  // Filtrer les événements par les jeux suivis
  const events = allEvents.filter(event => 
    followedGameNames.includes(event.gameName)
  );

  // Récupérer les détails des lairs suivis
  const lairsDetails = await Promise.all(
    user.lairs.map(lairId => getLairById(lairId))
  );
  const lairs = lairsDetails.filter((lair): lair is Lair => lair !== null);

  // Créer un map des lairs pour faciliter la recherche
  const lairsMap = new Map<string, Lair>();
  lairs.forEach((lair) => {
    lairsMap.set(lair.id, lair);
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Calendrier des Événements
          </h1>
          <p className="text-muted-foreground">
            Événements des lieux que vous suivez pour les jeux qui vous intéressent
          </p>
        </div>
        
        {events.length === 0 ? (
          <Card>
            <CardHeader className="text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Aucun événement prévu</CardTitle>
              <CardDescription>
                Aucun événement n'est prévu dans les lieux que vous suivez pour les jeux qui vous intéressent.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex gap-4 justify-center flex-wrap pb-6">
              <Button variant="outline" asChild>
                <Link href="/lairs">
                  <MapPin className="mr-2 h-4 w-4" />
                  Gérer mes lieux
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/account">
                  <Gamepad2 className="mr-2 h-4 w-4" />
                  Gérer mes jeux
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EventsCalendar events={events} lairsMap={lairsMap} />
        )}
      </div>
    </div>
  );
}
