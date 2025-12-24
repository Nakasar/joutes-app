import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAchievementsForUser } from "@/lib/db/achievements";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export default async function AchievementsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  const achievements = await getAchievementsForUser(session.user.id);

  // Calculer la progression
  const unlockedCount = achievements.filter(a => a.unlockedAt).length;
  const totalCount = achievements.length;
  const progressPercentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const totalPoints = achievements.reduce((acc, curr) => acc + (curr.unlockedAt ? curr.points : 0), 0);

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Trophy className="h-8 w-8 text-yellow-500" />
          Mes Succès
        </h1>
        <p className="text-muted-foreground">
          Suivez votre progression et débloquez des récompenses exclusives.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Progression globale</CardTitle>
          <CardDescription>
            Vous avez débloqué {unlockedCount} sur {totalCount} succès ({totalPoints} points).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-secondary h-4 rounded-full overflow-hidden">
            <div
              className="bg-yellow-500 h-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="text-right text-sm text-muted-foreground mt-2">{progressPercentage}% complété</p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {achievements.map((achievement) => {
          const isUnlocked = !!achievement.unlockedAt;

          return (
            <Card key={achievement.id} className={cn("transition-opacity", !isUnlocked && "opacity-70 bg-muted/50")}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="text-4xl mb-2">{achievement.icon}</div>
                  {isUnlocked ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">Débloqué</Badge>
                  ) : (
                    <Badge variant="outline"><Lock className="w-3 h-3 mr-1" /> Verrouillé</Badge>
                  )}
                </div>
                <CardTitle className={cn("text-lg", !isUnlocked && "text-muted-foreground")}>
                  {achievement.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">
                  {achievement.description}
                </p>
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span className="font-medium text-yellow-600 dark:text-yellow-500">
                    {achievement.points} pts
                  </span>
                  {isUnlocked && achievement.unlockedAt && (
                    <span>
                      {new Date(achievement.unlockedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

