"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { AchievementIcon } from "@/components/AchievementIcon";
import type { AchievementWithUnlockInfo } from "@/lib/types/Achievement";
import { revokeAchievementForUserAction } from "./admin-actions";

/**
 * Retirer un succès — ou un statut, qui n'en est qu'une variété.
 *
 * Le pendant qui manquait à `UnlockAchievementButton` : jusqu'ici, un succès
 * accordé par erreur ne pouvait être repris qu'en le supprimant pour tout le
 * monde.
 *
 * Ne rend rien quand la personne n'a aucun succès, comme son voisin fait quand
 * il n'y a rien à accorder : un bouton qui ouvre une liste vide est une
 * promesse déçue.
 */
export default function RevokeAchievementButton({
  userId,
  userTag,
  unlockedAchievements,
}: {
  userId: string;
  userTag: string;
  unlockedAchievements: AchievementWithUnlockInfo[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (unlockedAchievements.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Trash2 className="mr-2 h-4 w-4" />
          Retirer un succès
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retirer un succès à {userTag}</DialogTitle>
          <DialogDescription>
            Le succès reste dans le catalogue ; seule son attribution à ce compte est
            retirée.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2">
          {unlockedAchievements.map((achievement) => (
            <li
              key={achievement.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <AchievementIcon
                  icon={achievement.icon}
                  iconImage={achievement.iconImage}
                  name={achievement.name}
                  size={20}
                />
                <span className="font-medium">{achievement.name}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await revokeAchievementForUserAction(userId, achievement.id);
                    if (result.success) {
                      toast.success("Succès retiré.");
                      router.refresh();
                    } else {
                      toast.error("Le retrait a échoué.");
                    }
                  })
                }
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
