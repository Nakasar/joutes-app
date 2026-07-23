import { notFound } from "next/navigation";
import { getPublicUserProfileAction } from "@/app/account/user-actions";
import { getAllGames } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import { getAchievementsForUser, getAllAchievements } from "@/lib/db/achievements";
import { getPublicWishlistsForOwner } from "@/lib/db/wishlists";
import { getSellListForOwner } from "@/lib/db/sell-lists";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gamepad2, MapPin, Lock, Globe, ExternalLink, Trophy, Heart, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AchievementIcon } from "@/components/AchievementIcon";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";
import {Achievement, AchievementWithUnlockInfo} from "@/lib/types/Achievement";
import { checkAdmin } from "@/lib/middleware/admin";
import { UnlockAchievementButton } from "@/app/users/UnlockAchievementButton";
import { Metadata } from "next";

interface UserProfilePageProps {
  params: Promise<{
    userTagOrId: string;
  }>;
}

export async function generateMetadata({
  params,
}: UserProfilePageProps): Promise<Metadata> {
  const { userTagOrId } = await params;
  const decodedUserTagOrId = decodeURIComponent(userTagOrId);
  const result = await getPublicUserProfileAction(decodedUserTagOrId);

  if (!result.success || !result.user) {
    return { title: "Profil introuvable" };
  }

  const { user } = result;
  const userTag =
    user.displayName && user.discriminator
      ? `${user.displayName}#${user.discriminator}`
      : user.username;
  const description = `Profil de ${userTag} sur Joutes : collection, decks et wishlists partagés.`;

  return {
    title: userTag,
    description,
    openGraph: {
      title: `${userTag} - Joutes`,
      description,
    },
  };
}

export default async function UserProfilePage({ params }: UserProfilePageProps) {
  const { userTagOrId } = await params;
  
  // Décoder l'URL au cas où le userTag contient des caractères spéciaux
  const decodedUserTagOrId = decodeURIComponent(userTagOrId);
  
  const result = await getPublicUserProfileAction(decodedUserTagOrId);
  
  if (!result.success || !result.user) {
    notFound();
  }
  
  const { user, isPublic } = result;
  
  // Récupérer les détails des jeux si le profil est public
  let userGames: Game[] = [];
  if (isPublic && user.games && user.games.length > 0) {
    const allGames = await getAllGames();
    userGames = user.games
      .map(gameId => allGames.find(g => g.id === gameId))
      .filter((game): game is Game => game !== undefined);
  }
  
  // Récupérer les détails des lairs si le profil est public
  let userLairs: Lair[] = [];
  if (isPublic && user.lairs && user.lairs.length > 0) {
    const lairsPromises = user.lairs.map(lairId => getLairById(lairId));
    const lairsResults = await Promise.all(lairsPromises);
    userLairs = lairsResults.filter((lair): lair is Lair => lair !== null);
  }

  // Récupérer les succès si le profil est public
  let userAchievements: AchievementWithUnlockInfo[] = [];
  if (isPublic) {
    const allAchievements = await getAchievementsForUser(user.id);
    // On ne garde que les succès débloqués pour l'affichage public
    userAchievements = allAchievements.filter(a => a.unlockedAt);
  }

  // Listes de souhaits publiques (affichées quel que soit isPublic : c'est un choix explicite par liste)
  const publicWishlists = await getPublicWishlistsForOwner({ type: "user", id: user.id });

  // Liste de vente (toujours publique, affichée quel que soit isPublic)
  const sellList = await getSellListForOwner({ type: "user", id: user.id });

  // Vérifier si l'utilisateur connecté est admin
  const isAdmin = await checkAdmin();

  // Récupérer tous les succès disponibles pour les admins
  let allAvailableAchievements: Achievement[] = [];
  let unlockedAchievements: string[] = [];
  if (isAdmin) {
    allAvailableAchievements = await getAllAchievements();
    const userAllAchievements = await getAchievementsForUser(user.id);
    unlockedAchievements = userAllAchievements
      .filter(a => a.unlockedAt)
      .map(a => a.id);
  }

  // Filtrer les succès non encore débloqués pour l'admin
  const availableToUnlock = isAdmin
    ? allAvailableAchievements.filter(a => !unlockedAchievements.includes(a.id))
    : [];

  const userTag = user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.username;

  const displayImage = user.profileImage || user.avatar;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* En-tête du profil */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {displayImage && (
                  <img 
                    src={displayImage} 
                    alt={`Avatar de ${userTag}`}
                    className="w-20 h-20 rounded-full ring-4 ring-primary/20 object-cover"
                  />
                )}
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                      {userTag}
                      {!isPublic && (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      )}
                    </h1>

                    {/* Bouton admin pour débloquer un succès */}
                    {isAdmin && (
                      <UnlockAchievementButton
                        userId={user.id}
                        userTag={userTag}
                        availableAchievements={availableToUnlock}
                      />
                    )}
                  </div>

                  {/* Description */}
                  {user.description && (
                    <p className="text-muted-foreground mt-3 whitespace-pre-wrap">
                      {user.description}
                    </p>
                  )}
                  
                  {/* Site web et réseaux sociaux */}
                  {(user.website || (user.socialLinks && user.socialLinks.length > 0)) && (
                    <div className="mt-4 space-y-2">
                      {user.website && (
                        <a 
                          href={user.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                        >
                          <Globe className="h-4 w-4" />
                          {new URL(user.website).hostname}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      
                      {user.socialLinks && user.socialLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {user.socialLinks.map((link, index) => (
                            <a
                              key={index}
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary transition-colors"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {new URL(link).hostname}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!isPublic && (
                    <p className="text-sm text-muted-foreground mt-4">
                      Ce profil est privé. Seules les informations publiques sont affichées.
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Jeux suivis (si profil public) */}
          {isPublic && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Gamepad2 className="h-5 w-5" />
                  Jeux suivis
                </CardTitle>
                <CardDescription>
                  Les jeux dont {user.displayName || user.username} suit les événements
                </CardDescription>
              </CardHeader>
              <CardContent>
                {userGames.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun jeu suivi pour le moment.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userGames.map((game) => (
                      <div
                        key={game.id}
                        className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        {game.icon && (
                          <img 
                            src={game.icon} 
                            alt={game.name}
                            className="w-10 h-10 rounded object-cover"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{game.name}</p>
                          {game.type && (
                            <Badge variant="secondary" className="mt-1 text-xs">
                              {game.type}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Lieux suivis (si profil public) */}
          {isPublic && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Lieux suivis
                </CardTitle>
                <CardDescription>
                  Les lieux dont {user.displayName || user.username} suit les événements
                </CardDescription>
              </CardHeader>
              <CardContent>
                {userLairs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Aucun lieu suivi pour le moment.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {userLairs.map((lair) => (
                      <a
                        key={lair.id}
                        href={`/lairs/${lair.id}`}
                        className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <MapPin className="h-5 w-5 text-primary mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold">{lair.name}</p>
                          {lair.address && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {lair.address}
                            </p>
                          )}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Succès (si profil public) */}
          {isPublic && userAchievements.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Succès
                </CardTitle>
                <CardDescription>
                  Les succès débloqués par {user.displayName || user.username}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {userAchievements.map(achievement => (
                    <div
                      key={achievement.id}
                      className="flex items-center gap-3 p-3 border rounded-lg bg-muted"
                    >
                      {(achievement.iconImage || achievement.icon) && (
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-background">
                          <AchievementIcon
                            icon={achievement.icon}
                            iconImage={achievement.iconImage}
                            name={achievement.name}
                            size={40}
                          />
                        </span>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{achievement.name}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {achievement.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {achievement.points} points
                          </Badge>
                          {achievement.unlockedAt && (
                            <Badge variant="outline" className="text-xs">
                              Débloqué le {new Date(achievement.unlockedAt).toLocaleDateString()}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Listes de souhaits publiques */}
          {publicWishlists.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Listes de souhaits
                </CardTitle>
                <CardDescription>
                  Les listes de souhaits publiques de {user.displayName || user.username}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {publicWishlists.map((wishlist) => (
                    <a
                      key={wishlist.id}
                      href={`/wishlists/${wishlist.id}`}
                      className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <Heart className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{wishlist.name}</p>
                        {wishlist.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {wishlist.description}
                          </p>
                        )}
                        <Badge variant="secondary" className="mt-2 text-xs">
                          {wishlist.itemsCount} carte{wishlist.itemsCount !== 1 ? "s" : ""}
                        </Badge>
                      </div>
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Liste de vente publique */}
          {sellList && sellList.itemsCount > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Liste de vente
                </CardTitle>
                <CardDescription>
                  Les cartes que {user.displayName || user.username} met en vente
                </CardDescription>
              </CardHeader>
              <CardContent>
                <a
                  href={`/sell-lists/${sellList.id}`}
                  className="flex items-start gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Tag className="h-5 w-5 text-primary mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">Voir la liste de vente</p>
                    <Badge variant="secondary" className="mt-2 text-xs">
                      {sellList.itemsCount} carte{sellList.itemsCount !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </a>
              </CardContent>
            </Card>
          )}

          {/* Message si profil privé */}
          {!isPublic && (
            <Card className="border-dashed">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Lock className="h-5 w-5" />
                  <p className="text-sm">
                    Les jeux et lieux suivis par cet utilisateur ne sont pas visibles publiquement.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
