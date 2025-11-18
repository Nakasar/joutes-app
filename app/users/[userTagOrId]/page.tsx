import { notFound } from "next/navigation";
import { getPublicUserProfileAction } from "@/app/account/user-actions";
import { getAllGames } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { User as UserIcon, Gamepad2, MapPin, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Game } from "@/lib/types/Game";
import { Lair } from "@/lib/types/Lair";

interface UserProfilePageProps {
  params: Promise<{
    userTagOrId: string;
  }>;
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
  
  const userTag = user.displayName && user.discriminator 
    ? `${user.displayName}#${user.discriminator}`
    : user.username;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="space-y-8">
          {/* En-tête du profil */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                {user.avatar && (
                  <img 
                    src={user.avatar} 
                    alt={`Avatar de ${userTag}`}
                    className="w-20 h-20 rounded-full ring-4 ring-primary/20"
                  />
                )}
                <div className="flex-1">
                  <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                    {userTag}
                    {!isPublic && (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    )}
                  </h1>
                  {!isPublic && (
                    <p className="text-sm text-muted-foreground mt-2">
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
