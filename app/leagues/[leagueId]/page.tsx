import { getLeagueById, isLeagueOrganizer, getLeagueRanking, getLeagueParticipant } from "@/lib/db/leagues";
import { getLairById } from "@/lib/db/lairs";
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
} from "lucide-react";
import { LeagueStatus, LeagueFormat } from "@/lib/types/League";
import JoinLeagueButton from "./JoinLeagueButton";
import LeaveLeagueButton from "./LeaveLeagueButton";
import KillerTargetsClient from "./KillerTargetsClient";
import PointsMatchReportingClient from "./PointsMatchReportingClient";
import LeagueRankingClient from "./LeagueRankingClient";

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

  const leagueParticipant = session?.user?.id ? await getLeagueParticipant(league.id, session.user.id) : null;

  const canManage = session?.user?.id
    ? await isLeagueOrganizer(leagueId, session.user.id)
    : false;

  const isParticipant = !!leagueParticipant;

  // Vérifier l'accès aux ligues privées
  if (!league.isPublic && !isParticipant && !canManage) {
    notFound();
  }

  const games = league.games;
  const lairs = league.lairs;

  const lairDetails = session?.user?.id
    ? await Promise.all(league.lairIds.map((lairId) => getLairById(lairId)))
    : [];
  const ownedLairIds = session?.user?.id
    ? lairDetails
        .filter((lair) => lair && lair.owners.includes(session.user.id))
        .map((lair) => lair!.id)
    : [];

  // Récupérer le classement
  const ranking = await getLeagueRanking(leagueId);

  // Récupérer les infos du créateur
  const creator = league.creator;

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
    league.status !== "IN_PROGRESS";

  const canReportPointsMatches =
    league.format === "POINTS" &&
    !!session?.user?.id &&
    isParticipant &&
    league.status !== "COMPLETED" &&
    league.status !== "CANCELLED";

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
            <Button variant="outline" asChild>
              <Link href={`/leagues/${leagueId}/matches`}>Historique des matchs</Link>
            </Button>
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

        {league.banner && (
          <div className="overflow-hidden rounded-lg border bg-muted/30">
            <img
              src={league.banner}
              alt={`Bannière de ${league.name}`}
              className="h-48 w-full object-cover"
            />
          </div>
        )}

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
                    : "Classement par ratio victoires / défaites"}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LeagueRankingClient
                  leagueId={leagueId}
                  leagueFormat={league.format}
                />
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

            {canReportPointsMatches && session?.user?.id && (
              <PointsMatchReportingClient
                leagueId={league.id}
                league={league}
                participantsWithUsers={ranking}
                currentUserId={session.user.id}
              />
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
                  <p className="text-muted-foreground mt-2">
                    {league.killerConfig.requireLair ?? true
                      ? "Le résultat doit être confirmé par le lieu du match et par votre adversaire."
                      : "Le résultat doit être confirmé par votre adversaire."}
                  </p>
                </CardContent>
              </Card>
            )}

            {league.format === "KILLER" && session?.user?.id && (
              <KillerTargetsClient
                leagueId={league.id}
                league={league}
                participant={leagueParticipant}
                participantsWithUsers={ranking}
                currentUserId={session.user.id}
                ownedLairIds={ownedLairIds}
              />
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
                    {league.participantsCount} participant
                    {(league.participantsCount ?? 0) > 1 ? "s" : ""}
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
