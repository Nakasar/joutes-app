import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/users";
import { getAllGames } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import GamesManager from "./GamesManager";
import LairsManager from "./LairsManager";
import UsernameDisplay from "./UsernameDisplay";
import ProfileEditor from "./ProfileEditor";
import ProfileImageDisplay from "./ProfileImageDisplay";
import LocationDisplay from "./LocationDisplay";
import ProfileVisibilitySwitch from "./ProfileVisibilitySwitch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User as UserIcon, Mail, Gamepad2, MapPin, FileText, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

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
          {/* Header avec actions */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Mon compte
              </h1>
              <p className="text-muted-foreground">
                Gérez votre profil et vos préférences
              </p>
            </div>
            <Link href="/account/integrations">
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4 mr-2" />
                Intégrations
              </Button>
            </Link>
          </div>

          {/* Section Informations du profil - Carte principale */}
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <UserIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Informations du profil</CardTitle>
                    <CardDescription className="mt-1">
                      Vos informations personnelles et publiques
                    </CardDescription>
                  </div>
                </div>
                {/* Toggle de visibilité intégré dans le header */}
                <ProfileVisibilitySwitch 
                  initialIsPublic={user.isPublicProfile || false}
                  userTag={user.displayName && user.discriminator ? `${user.displayName}#${user.discriminator}` : undefined}
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Image de profil et email */}
              <div className="flex items-start gap-6 pb-6 border-b">
                <ProfileImageDisplay 
                  currentImage={user.profileImage}
                  currentAvatar={user.avatar}
                />
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                      <Mail className="h-4 w-4" />
                      <span>Adresse email</span>
                    </div>
                    <p className="text-lg font-semibold">{user.email}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      L&apos;email ne peut pas être modifié
                    </p>
                  </div>
                </div>
              </div>

              {/* Nom d'utilisateur */}
              <div className="py-4 border-b">
                <UsernameDisplay
                  currentDisplayName={user.displayName}
                  currentDiscriminator={user.discriminator}
                />
              </div>

              {/* Localisation */}
              <div className="pt-4">
                <LocationDisplay 
                  currentLatitude={user.location?.latitude}
                  currentLongitude={user.location?.longitude}
                />
              </div>
            </CardContent>
          </Card>

          {/* Section Informations publiques */}
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Informations publiques</CardTitle>
                  <CardDescription className="mt-1">
                    Ces informations seront visibles sur votre profil public
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ProfileEditor 
                initialDescription={user.description}
                initialWebsite={user.website}
                initialSocialLinks={user.socialLinks}
              />
            </CardContent>
          </Card>

          {/* Section Jeux suivis */}
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Gamepad2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mes jeux suivis</CardTitle>
                  <CardDescription className="mt-1">
                    Gérez les jeux dont vous souhaitez suivre les événements
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GamesManager 
                userGames={userGames}
                allGames={allGames}
              />
            </CardContent>
          </Card>

          {/* Section Lieux suivis */}
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mes lieux suivis</CardTitle>
                  <CardDescription className="mt-1">
                    Gérez les lieux dont vous souhaitez suivre les événements
                  </CardDescription>
                </div>
              </div>
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
