import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import GamesManager from "./GamesManager";
import LairsManager from "./LairsManager";
import UsernameManager from "./UsernameManager";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User as UserIcon, Mail, Gamepad2, MapPin } from "lucide-react";

export default async function AccountPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  // Récupérer les données complètes de l'utilisateur
  const user = await getUserById(session.user.id);
  
  if (!user) {
    redirect("/login");
  }

  // Récupérer tous les jeux disponibles
  const allGames = await getAllGames();

  // Récupérer les détails des jeux suivis par l'utilisateur
  const followedGames = await Promise.all(
    (user.games || []).map(async (gameId) => {
      const game = allGames.find(g => g.id === gameId);
      return game;
    })
  );
  const userGames = followedGames.filter(game => game !== undefined);

  // Récupérer les détails des lairs suivis par l'utilisateur
  const followedLairs = await Promise.all(
    (user.lairs || []).map(async (lairId) => {
      const lair = await getLairById(lairId);
      return lair;
    })
  );
  const userLairs = followedLairs.filter(lair => lair !== null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Mon compte</h1>
            <p className="text-muted-foreground">
              Gérez votre profil et vos préférences
            </p>
          </div>

          {/* Section Informations du profil */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Informations du profil
              </CardTitle>
              <CardDescription>
                Vos informations personnelles
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start gap-4">
                {user.avatar && (
                  <img 
                    src={user.avatar} 
                    alt="Avatar" 
                    className="w-16 h-16 rounded-full ring-2 ring-primary/20"
                  />
                )}
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                      <Mail className="h-4 w-4" />
                      <span>Email</span>
                    </div>
                    <p className="text-lg font-semibold">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      L&apos;email ne peut pas être modifié
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Gestionnaire de nom d'utilisateur */}
              <div className="pt-4 border-t">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Nom d&apos;utilisateur
                </h3>
                <UsernameManager
                  currentDisplayName={user.displayName}
                  currentDiscriminator={user.discriminator}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section Jeux suivis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5" />
                Mes jeux suivis
              </CardTitle>
              <CardDescription>
                Gérez les jeux dont vous souhaitez suivre les événements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GamesManager 
                userGames={userGames}
                allGames={allGames}
              />
            </CardContent>
          </Card>

          {/* Section Lieux suivis */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Mes lieux suivis
              </CardTitle>
              <CardDescription>
                Gérez les lieux dont vous souhaitez suivre les événements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <LairsManager userLairs={userLairs} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
