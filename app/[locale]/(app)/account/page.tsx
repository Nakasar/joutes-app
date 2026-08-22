import { AccountPanelSkeleton } from "@/components/AccountPanelSkeleton.tsx";
import { Suspense } from "react";
import { auth } from "@/lib/auth.ts";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUserById } from "@/lib/db/users.ts";
import { getAllGames } from "@/lib/db/games.ts";
import { getLairById } from "@/lib/db/lairs.ts";
import GamesManager from "./GamesManager.tsx";
import LairsManager from "./LairsManager.tsx";
import PricePreferenceManager from "./PricePreferenceManager.tsx";
import UsernameDisplay from "./UsernameDisplay.tsx";
import ProfileEditor from "./ProfileEditor.tsx";
import ProfileImageDisplay from "./ProfileImageDisplay.tsx";
import LocationDisplay from "./LocationDisplay.tsx";
import ProfileVisibilitySwitch from "./ProfileVisibilitySwitch.tsx";
import QuizScores from "./QuizScores.tsx";
import { getUserQuizScores } from "@/lib/db/quiz-scores.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {User as UserIcon, Mail, Gamepad2, MapPin, FileText, Settings, Shield, Trophy, MailIcon, GraduationCap, Heart, Coins} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";

async function AccountPageContent() {
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

  const quizScores = await getUserQuizScores(session.user.id);

  // Récupérer les détails des jeux suivis par l'utilisateur
  const followedGames = await Promise.all(
    (user.games || []).map(async (gameId) => {
      return allGames.find(g => g.id === gameId);
    })
  );
  const userGames = followedGames.filter(game => game !== undefined);

  // Récupérer les détails des lairs suivis par l'utilisateur
  const followedLairs = await Promise.all(
    (user.lairs || []).map(async (lairId) => {
      return await getLairById(lairId);
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
            {/* `flex-wrap` : les boutons portent `whitespace-nowrap shrink-0`,
                et un cinquième élargirait toute la page sur un téléphone. */}
            <div className="flex flex-wrap gap-4">
              <Link href="/account/subscription">
                <Button variant="outline" size="sm">
                  <Heart className="h-4 w-4 mr-2" />
                  Abonnement
                </Button>
              </Link>
              <Link href="/account/achievements">
                <Button variant="outline" size="sm">
                  <Trophy className="h-4 w-4 mr-2" />
                  Succès
                </Button>
              </Link>
              <Link href="/account/notifications">
                <Button variant="outline" size="sm">
                  <MailIcon className="h-4 w-4 mr-2" />
                  Notifications
                </Button>
              </Link>
              <Link href="/account/security">
                <Button variant="outline" size="sm">
                  <Shield className="h-4 w-4 mr-2" />
                  Sécurité
                </Button>
              </Link>
              <Link href="/account/integrations">
                <Button variant="outline" size="sm">
                  <Settings className="h-4 w-4 mr-2" />
                  Intégrations
                </Button>
              </Link>
            </div>
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
                  currentLabel={user.location?.label}
                  currentCity={user.location?.city}
                  currentPostalCode={user.location?.postalCode}
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

          {/* Section Jeux suivis. L'ancre sert au menu de navigation, dont le
              bouton « Personnaliser » mène droit aux favoris. */}
          <Card id="jeux" className="border-2 shadow-lg scroll-mt-20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Gamepad2 className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mes jeux suivis</CardTitle>
                  <CardDescription className="mt-1">
                    Gérez les jeux dont vous souhaitez suivre les événements, et
                    choisissez ceux qui vous suivent dans le menu
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <GamesManager
                userGames={userGames}
                allGames={allGames}
                favoriteGameIds={user.favoriteGames ?? []}
              />
            </CardContent>
          </Card>

          {/* Section Prix des cartes. L'ancre sert au raccourci « Choisir ma
              source de prix » de la fiche d'une carte. */}
          <Card id="prices" className="border-2 shadow-lg scroll-mt-20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Coins className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Prix des cartes</CardTitle>
                  <CardDescription className="mt-1">
                    D&apos;où viennent les prix affichés sur vos cartes, votre collection et vos échanges
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PricePreferenceManager initialPreference={user.pricePreference} />
            </CardContent>
          </Card>

          {/* Section Scores de quizz */}
          <Card className="border-2 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mes scores de quizz</CardTitle>
                  <CardDescription className="mt-1">
                    Le résultat de votre dernière validation, section par section
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <QuizScores scores={quizScores} />
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

/**
 * Tout cet écran est derrière la porte, titre compris : on ne montre pas la
 * mise en page d'un espace personnel avant de savoir à qui il appartient. La
 * coquille ne garde que le conteneur et la silhouette.
 */
export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <AccountPanelSkeleton cards={3} label="Chargement de votre compte" />
        </div>
      }
    >
      <AccountPageContent />
    </Suspense>
  );
}
