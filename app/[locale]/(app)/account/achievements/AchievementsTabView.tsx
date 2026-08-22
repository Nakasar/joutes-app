import { Lock, Trophy } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AchievementIcon } from "@/components/AchievementIcon.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { getAchievementsForUser } from "@/lib/db/achievements.ts";
import type { User } from "@/lib/types/User";
import { cn } from "@/lib/utils.ts";

/**
 * L'onglet « Succès ».
 *
 * Le contenu de l'ancienne page `/account/achievements`, déplacé sans changer
 * ce qu'il montre : la même progression, la même grille, les succès verrouillés
 * compris — voir ce qu'on n'a pas encore est la moitié de l'intérêt.
 */
export default async function AchievementsTabView({ user }: { user: User }) {
  const [achievements, t] = await Promise.all([
    getAchievementsForUser(user.id),
    getTranslations("Account.achievements"),
  ]);

  const unlockedCount = achievements.filter((achievement) => achievement.unlockedAt).length;
  const totalCount = achievements.length;
  const progressPercentage = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;
  const totalPoints = achievements.reduce(
    (acc, curr) => acc + (curr.unlockedAt ? curr.points : 0),
    0,
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-2xl font-bold">
          <Trophy className="h-6 w-6 text-yellow-500" aria-hidden />
          {t("title")}
        </h2>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("progressTitle")}</CardTitle>
          <CardDescription>
            {t("progressDescription", {
              unlocked: unlockedCount,
              total: totalCount,
              points: totalPoints,
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="h-4 w-full overflow-hidden rounded-full bg-secondary"
            role="progressbar"
            aria-valuenow={progressPercentage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("progressTitle")}
          >
            <div
              className="h-full bg-yellow-500 transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <p className="mt-2 text-right text-sm text-muted-foreground">
            {t("percentComplete", { percent: progressPercentage })}
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {achievements.map((achievement) => {
          const isUnlocked = !!achievement.unlockedAt;

          return (
            <Card
              key={achievement.id}
              className={cn("transition-opacity", !isUnlocked && "bg-muted/50 opacity-70")}
            >
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="mb-2">
                    <AchievementIcon
                      icon={achievement.icon}
                      iconImage={achievement.iconImage}
                      name={achievement.name}
                      size={48}
                    />
                  </div>
                  {isUnlocked ? (
                    <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                      {t("unlocked")}
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Lock className="mr-1 h-3 w-3" aria-hidden /> {t("locked")}
                    </Badge>
                  )}
                </div>
                <CardTitle className={cn("text-lg", !isUnlocked && "text-muted-foreground")}>
                  {achievement.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="mb-4 min-h-[40px] text-sm text-muted-foreground">
                  {achievement.description}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-yellow-600 dark:text-yellow-500">
                    {t("points", { points: achievement.points })}
                  </span>
                  {isUnlocked && achievement.unlockedAt && (
                    <span>{new Date(achievement.unlockedAt).toLocaleDateString()}</span>
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
