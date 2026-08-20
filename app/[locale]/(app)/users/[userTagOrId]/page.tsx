import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getPublicUserProfileAction } from "@/app/[locale]/(app)/account/user-actions.ts";
import { readAllGames } from "@/lib/db/games-cached.ts";
import { getLairById } from "@/lib/db/lairs.ts";
import { getAchievementsForUser, getAllAchievements } from "@/lib/db/achievements.ts";
import { getPublicWishlistsForOwner } from "@/lib/db/wishlists.ts";
import { getSellListForOwner } from "@/lib/db/sell-lists.ts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Gamepad2, MapPin, Lock, Globe, ExternalLink, Trophy, Heart, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { AchievementIcon } from "@/components/AchievementIcon.tsx";
import { Game } from "@/lib/types/Game.ts";
import { Lair } from "@/lib/types/Lair.ts";
import {Achievement, AchievementWithUnlockInfo} from "@/lib/types/Achievement.ts";
import { checkAdmin } from "@/lib/middleware/admin.ts";
import { UnlockAchievementButton } from "@/app/[locale]/(app)/users/UnlockAchievementButton.tsx";
import GrantPlanButton from "@/app/[locale]/(app)/users/GrantPlanButton.tsx";
import RevokeAchievementButton from "@/app/[locale]/(app)/users/RevokeAchievementButton.tsx";
import { getSubscriptionByUserId } from "@/lib/db/subscriptions.ts";
import ReportButton from "@/components/ReportButton.tsx";
import { PlanBadge } from "@/components/PlanBadge.tsx";
import { StatusBadge } from "@/components/StatusBadge.tsx";
import { visibleStatuses } from "@/lib/achievements/status.ts";
import { plansForUserId } from "@/lib/subscriptions/access.ts";
import { displayPlan } from "@/lib/subscriptions/entitlements.ts";
import { appearanceForPlan } from "@/lib/subscriptions/tone.ts";
import { cn } from "@/lib/utils.ts";
import { Metadata } from "next";
import { Suspense } from "react";
import { ProfileSkeleton } from "./ProfileSkeleton.tsx";

interface UserProfilePageProps {
  params: Promise<{
    userTagOrId: string;
  }>;
}

export async function generateMetadata({
  params,
}: UserProfilePageProps): Promise<Metadata> {
  const { userTagOrId } = await params;
  // Le pilote Mongo touche à l'horloge en lisant le profil, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

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

async function UserProfileContent({ params }: UserProfilePageProps) {
  const { userTagOrId } = await params;

  // Le pilote Mongo touche à l'horloge en lisant le profil, ce qu'un prérendu ne
  // sait pas figer, et aucune frontière n'y change rien.
  await connection();

  
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
    const allGames = await readAllGames();
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

  // Une seule lecture des succès, trois usages. Elle était faite deux fois quand
  // le visiteur était administrateur, et elle vivait dans le `if (isPublic)` —
  // ce qui empêchait d'afficher un statut sur un profil privé.
  const allAchievements = await getAchievementsForUser(user.id);
  const unlocked = allAchievements.filter(a => a.unlockedAt);

  // La grille de succès, elle, reste réservée aux profils publics.
  const userAchievements: AchievementWithUnlockInfo[] = isPublic ? unlocked : [];

  // Listes de souhaits publiques (affichées quel que soit isPublic : c'est un choix explicite par liste)
  const publicWishlists = await getPublicWishlistsForOwner({ type: "user", id: user.id });

  // Liste de vente (toujours publique, affichée quel que soit isPublic)
  const sellList = await getSellListForOwner({ type: "user", id: user.id });


  const userTag = user.displayName && user.discriminator
    ? `${user.displayName}#${user.discriminator}`
    : user.username;

  const displayImage = user.profileImage || user.avatar;

  // Le palier de la personne dont on regarde le profil — pas celui du visiteur.
  // Contour et badge s'en déduisent : rien de cosmétique n'est stocké, donc rien
  // n'est à révoquer quand un abonnement s'arrête.
  const profilePlan = displayPlan(await plansForUserId(user.id));
  const planAppearance = appearanceForPlan(profilePlan);

  // Les statuts sortent de la même lecture de succès que la grille publique.
  const statuses = visibleStatuses(unlocked);

  return (
        <div className="space-y-8">
          {/* En-tête du profil */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {displayImage && (
                  <img 
                    src={displayImage} 
                    alt={`Avatar de ${userTag}`}
                    className={cn(
                      "w-20 h-20 rounded-full ring-4 object-cover",
                      planAppearance ? planAppearance.ring : "ring-primary/20"
                    )}
                  />
                )}
                <div className="flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* `flex-wrap` : le badge porte `shrink-0`, et un pseudo un
                        peu long élargirait sinon toute la page sur un téléphone. */}
                    <h1 className="text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2">
                      {userTag}
                      {!isPublic && (
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      )}
                      <PlanBadge plan={profilePlan} />
                      {/* Les statuts s'affichent quel que soit `isPublicProfile`,
                          comme le badge d'offre : un profil privé l'est sur son
                          contenu, et une marque de reconnaissance posée par
                          l'équipe n'est pas du contenu. */}
                      {statuses.map((status) => (
                        <StatusBadge key={status.id} status={status} />
                      ))}
                    </h1>

                    {/* `flex-wrap` : trois boutons d'administration peuvent
                        s'y trouver, tous en `shrink-0`. */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Trois lectures — droits, catalogue de succès,
                          abonnement brut — pour trois boutons que seule
                          l'administration voit. Sous leur propre frontière, et
                          sans silhouette : leur réserver la place déplacerait
                          le bouton de signalement pour tout le monde. */}
                      <Suspense fallback={null}>
                        <ProfileAdminTools
                          userId={user.id}
                          userTag={userTag}
                          unlocked={unlocked}
                        />
                      </Suspense>
                      <ReportButton contentType="user" contentId={user.id} />
                    </div>
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
  );
}

/**
 * Le profil, découpé par ce dont chaque partie dépend.
 *
 * Le corps tient à une lecture du profil et à quelques lectures de contenu —
 * jeux suivis, lieux, succès, listes. L'outillage d'administration, lui, coûte
 * trois lectures de plus pour trois boutons que presque personne ne voit : il a
 * sa propre frontière, à l'intérieur.
 */
export default function UserProfilePage(props: UserProfilePageProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <Suspense fallback={<ProfileSkeleton />}>
          <UserProfileContent {...props} />
        </Suspense>
      </div>
    </div>
  );
}

async function ProfileAdminTools({
  userId,
  userTag,
  unlocked,
}: {
  userId: string;
  userTag: string;
  unlocked: AchievementWithUnlockInfo[];
}) {
  const isAdmin = await checkAdmin();
  if (!isAdmin) {
    return null;
  }

  // Le catalogue complet n'intéresse que l'administration : on ne le charge que
  // pour elle. L'abonnement brut lui sert à distinguer ce qui est offert de ce
  // qui vient de Patreon, ce que les plans composés ne disent plus.
  const [allAvailableAchievements, adminSubscription] = await Promise.all([
    getAllAchievements(),
    getSubscriptionByUserId(userId),
  ]);

  const unlockedIds = new Set(unlocked.map((achievement) => achievement.id));
  const availableToUnlock: Achievement[] = allAvailableAchievements.filter(
    (achievement) => !unlockedIds.has(achievement.id)
  );

  return (
    <>
      <GrantPlanButton
        userId={userId}
        userTag={userTag}
        grantedPlans={adminSubscription?.grantedPlans ?? []}
        paidPlans={adminSubscription?.plans ?? []}
      />
      <UnlockAchievementButton
        userId={userId}
        userTag={userTag}
        availableAchievements={availableToUnlock}
      />
      <RevokeAchievementButton
        userId={userId}
        userTag={userTag}
        unlockedAchievements={unlocked}
      />
    </>
  );
}
