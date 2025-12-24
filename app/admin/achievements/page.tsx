import { getAllAchievements } from "@/lib/db/achievements";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteAchievementButton } from "@/app/admin/achievements/DeleteAchievementButton";

export default async function AdminAchievementsPage() {
  const achievements = await getAllAchievements();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Gestion des Succès</h1>
        <Button asChild>
          <Link href="/admin/achievements/new">
            <Plus className="mr-2 h-4 w-4" />
            Nouveau Succès
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {achievements.map((achievement) => (
          <Card key={achievement.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {achievement.name}
              </CardTitle>
              <div className="text-2xl">{achievement.icon}</div>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-muted-foreground mb-2">{achievement.slug}</div>
              <p className="text-sm mb-4 h-10 overflow-hidden">{achievement.description}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  <Badge variant="secondary">{achievement.points} pts</Badge>
                  {achievement.category && <Badge variant="outline">{achievement.category}</Badge>}
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/admin/achievements/${achievement.id}/edit`}>
                      Editer
                    </Link>
                  </Button>
                  <DeleteAchievementButton id={achievement.id} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

