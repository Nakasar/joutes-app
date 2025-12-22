import { getLeagueById, isLeagueOrganizer, getLeagueRanking } from "@/lib/db/leagues";
import { getGameById } from "@/lib/db/games";
import { getLairById } from "@/lib/db/lairs";
import { getUserById } from "@/lib/db/users";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Trophy,
  Users,
  Calendar,
  Settings,
  Target,
  Award,
  MapPin,
  Gamepad2,
  Crown,
  Medal,
} from "lucide-react";
import { LeagueStatus, LeagueFormat } from "@/lib/types/League";
import JoinLeagueButton from "./JoinLeagueButton";
import LeaveLeagueButton from "./LeaveLeagueButton";

const STATUS_LABELS: Record<LeagueStatus, string> = {
  DRAFT: "Brouillon",
  OPEN: "Inscriptions ouvertes",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

const STATUS_COLORS: Record<LeagueStatus, string> = {
  DRAFT: "bg-gray-500",
  OPEN: "bg-green-500",
  IN_PROGRESS: "bg-blue-500",
  COMPLETED: "bg-purple-500",
  CANCELLED: "bg-red-500",
};

const FORMAT_LABELS: Record<LeagueFormat, string> = {
  KILLER: "Killer",
  POINTS: "Points",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await getLeagueById(leagueId);

  if (!league) {
    return {
      title: "Ligue non trouvée",
    };
  }

  return {
    title: `${league.name} - Ligue`,
    description: league.description || `Ligue ${FORMAT_LABELS[league.format]}`,
  };
}

export default async function LeagueDetailPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const league = await getLeagueById(leagueId);

  if (!league) {
    notFound();
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const canManage = session?.user?.id
    ? await isLeagueOrganizer(leagueId, session.user.id)
    : false;

  const isParticipant = league.participants.some(
    (p) => p.userId === session?.user?.id
  );

  // Vérifier l'accès aux ligues privées
  if (!league.isPublic && !isParticipant && !canManage) {
    notFound();
  }

  // Récupérer les détails des jeux
  const gamesDetails = await Promise.all(
    league.gameIds.map(async (gameId) => {
      const game = await getGameById(gameId);
      return game;
    })
  );
  const games = gamesDetails.filter((game) => game !== null);

  // Récupérer les détails des lieux
  const lairsDetails = await Promise.all(
    league.lairIds.map(async (lairId) => {
      const lair = await getLairById(lairId);
      return lair;
    })
  );
  const lairs = lairsDetails.filter((lair) => lair !== null);

  // Récupérer le classement
  const ranking = await getLeagueRanking(leagueId);

  // Récupérer les infos des participants pour le classement
  const participantsWithUsers = await Promise.all(
    ranking.slice(0, 10).map(async (participant) => {
      const user = await getUserById(participant.userId);
      return { ...participant, user };
    })
  );

  // Récupérer les infos du créateur
  const creator = await getUserById(league.creatorId);

  const canJoin =
    session?.user?.id &&
    !isParticipant &&
    league.status !== "COMPLETED" &&
    league.status !== "CANCELLED" &&
    (!league.registrationDeadline || new Date() <= league.registrationDeadline) &&
    (!league.maxParticipants || league.participants.length < league.maxParticipants);

  const canLeave =
    session?.user?.id &&
    isParticipant &&
    league.status !== "IN_PROGRESS" &&
    league.creatorId !== session.user.id;

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link href="/leagues">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <h1 className="text-4xl font-bold">{league.name}</h1>
                <Badge className={`${STATUS_COLORS[league.status]} text-white`}>
                  {STATUS_LABELS[league.status]}
                </Badge>
              </div>
              {league.description && (
                <p className="text-xl text-muted-foreground">{league.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {canJoin && <JoinLeagueButton leagueId={leagueId} />}
            {canLeave && <LeaveLeagueButton leagueId={leagueId} />}
            {canManage && (
              <Button asChild>
                <Link href={`/leagues/${leagueId}/manage`}>
                  <Settings className="h-4 w-4 mr-2" />
                  Gérer
                </Link>
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Colonne principale */}
          <div className="lg:col-span-2 space-y-6">
            {/* Classement */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Classement
                </CardTitle>
                <CardDescription>
                  {league.format === "POINTS"
                    ? "Classement par points accumulés"
                    : "Participants encore en lice"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {participantsWithUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Aucun participant pour le moment
                  </p>
                ) : (
                  <div className="space-y-2">
                    {participantsWithUsers.map((participant, index) => (
                      <div
                        key={participant.userId}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          index === 0
                            ? "bg-yellow-500/10 border border-yellow-500/30"
                            : index === 1
                            ? "bg-gray-300/10 border border-gray-300/30"
                            : index === 2
                            ? "bg-orange-500/10 border border-orange-500/30"
                            : "bg-muted/50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-lg w-8 text-center">
                            {index === 0 && <Crown className="h-5 w-5 text-yellow-500 inline" />}
                            {index === 1 && <Medal className="h-5 w-5 text-gray-400 inline" />}
                            {index === 2 && <Medal className="h-5 w-5 text-orange-500 inline" />}
                            {index > 2 && `#${participant.rank}`}
                          </span>
                          <div className="flex items-center gap-2">
                            {participant.user?.avatar && (
                              <img
                                src={participant.user.avatar}
                                alt=""
                                className="h-8 w-8 rounded-full"
                              />
                            )}
                            <span className="font-medium">
                              {participant.user?.displayName ||
                                participant.user?.username ||
                                "Utilisateur inconnu"}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {participant.feats.length > 0 && (
                            <Badge variant="secondary">
                              {participant.feats.length} haut
                              {participant.feats.length > 1 ? "s" : ""} fait
                              {participant.feats.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                          <span className="font-bold text-lg">
                            {participant.points} pts
                          </span>
                        </div>
                      </div>
                    ))}
                    {ranking.length > 10 && (
                      <p className="text-center text-muted-foreground text-sm pt-2">
                        Et {ranking.length - 10} autres participants...
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Règles (format POINTS) */}
            {league.format === "POINTS" && league.pointsConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Règles de points
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold">
                        {league.pointsConfig.pointsRules.participation}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Participation
                      </div>
                    </div>
                    <div className="text-center p-4 bg-green-500/10 rounded-lg border border-green-500/30">
                      <div className="text-2xl font-bold text-green-600">
                        {league.pointsConfig.pointsRules.victory}
                      </div>
                      <div className="text-sm text-muted-foreground">Victoire</div>
                    </div>
                    <div className="text-center p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                      <div className="text-2xl font-bold text-red-600">
                        {league.pointsConfig.pointsRules.defeat}
                      </div>
                      <div className="text-sm text-muted-foreground">Défaite</div>
                    </div>
                  </div>

                  {league.pointsConfig.pointsRules.feats.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">Hauts faits</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {league.pointsConfig.pointsRules.feats.map((feat) => (
                          <div
                            key={feat.id}
                            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                          >
                            <div>
                              <span className="font-medium">{feat.title}</span>
                              {feat.description && (
                                <p className="text-xs text-muted-foreground">
                                  {feat.description}
                                </p>
                              )}
                            </div>
                            <Badge variant="secondary">+{feat.points} pts</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Règles (format KILLER) */}
            {league.format === "KILLER" && league.killerConfig && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Règles du Killer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">
                    Chaque joueur a{" "}
                    <strong>{league.killerConfig.targets} cible(s)</strong> à
                    affronter. Éliminez vos cibles en les battant dans une partie
                    pour progresser dans la compétition.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Infos */}
            <Card>
              <CardHeader>
                <CardTitle>Informations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Format */}
                <div className="flex items-center gap-2">
                  {league.format === "KILLER" ? (
                    <Target className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Award className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>Format : {FORMAT_LABELS[league.format]}</span>
                </div>

                {/* Participants */}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>
                    {league.participants.length} participant
                    {league.participants.length > 1 ? "s" : ""}
                    {league.maxParticipants && ` / ${league.maxParticipants}`}
                  </span>
                </div>

                {/* Dates */}
                {league.startDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Du {new Date(league.startDate).toLocaleDateString("fr-FR")}
                      {league.endDate &&
                        ` au ${new Date(league.endDate).toLocaleDateString("fr-FR")}`}
                    </span>
                  </div>
                )}

                {league.registrationDeadline && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    <span>
                      Inscriptions jusqu&apos;au{" "}
                      {new Date(league.registrationDeadline).toLocaleDateString(
                        "fr-FR"
                      )}
                    </span>
                  </div>
                )}

                {/* Créateur */}
                {creator && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">
                      Créée par
                    </span>
                    <Link
                      href={`/users/${creator.displayName}${creator.discriminator}`}
                      className="flex items-center gap-2 hover:underline"
                    >
                      {creator.avatar && (
                        <img
                          src={creator.avatar}
                          alt=""
                          className="h-6 w-6 rounded-full"
                        />
                      )}
                      <span className="font-medium">
                        {creator.displayName || creator.username}
                      </span>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Jeux */}
            {games.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gamepad2 className="h-5 w-5" />
                    Jeux
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {games.map((game) => (
                      <Badge key={game.id} variant="secondary">
                        {game.name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Lieux partenaires */}
            {lairs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Lieux partenaires
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {lairs.map((lair) => (
                      <Link
                        key={lair.id}
                        href={`/lairs/${lair.id}`}
                        className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{lair.name}</span>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
