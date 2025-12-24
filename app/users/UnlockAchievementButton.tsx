"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, Plus, AlertCircle, CheckCircle } from "lucide-react";
import { Achievement } from "@/lib/types/Achievement";
import { unlockAchievementForUserAction } from "./admin-actions";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface UnlockAchievementButtonProps {
  userId: string;
  userTag: string;
  availableAchievements: Achievement[];
}

export function UnlockAchievementButton({
  userId,
  userTag,
  availableAchievements
}: UnlockAchievementButtonProps) {
  const [open, setOpen] = useState(false);
  const [selectedAchievementId, setSelectedAchievementId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error", text: string } | null>(null);
  const router = useRouter();

  const handleUnlock = async () => {
    if (!selectedAchievementId) {
      setMessage({ type: "error", text: "Veuillez sélectionner un succès" });
      return;
    }

    const selectedAchievement = availableAchievements.find(a => a.id === selectedAchievementId);
    if (!selectedAchievement) return;

    setIsSubmitting(true);
    setMessage(null);

    // Note: On utilise l'ID au lieu du slug pour l'instant
    // Si vos achievements ont un slug, ajustez cette ligne
    const result = await unlockAchievementForUserAction(userId, selectedAchievement.id);

    if (result.success) {
      setMessage({
        type: "success",
        text: `Succès "${selectedAchievement.name}" débloqué pour ${userTag}`
      });
      setTimeout(() => {
        setOpen(false);
        setSelectedAchievementId("");
        setMessage(null);
        router.refresh();
      }, 1500);
    } else {
      setMessage({
        type: "error",
        text: result.error || "Erreur lors du déblocage du succès"
      });
    }

    setIsSubmitting(false);
  };

  if (availableAchievements.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Trophy className="h-4 w-4" />
          <Plus className="h-3 w-3" />
          Débloquer un succès
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Débloquer un succès</DialogTitle>
          <DialogDescription>
            Choisissez un succès à débloquer pour {userTag}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {message && (
            <Alert variant={message.type === "error" ? "destructive" : "default"}>
              {message.type === "success" ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <Select value={selectedAchievementId} onValueChange={setSelectedAchievementId}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez un succès" />
            </SelectTrigger>
            <SelectContent>
              {availableAchievements.map(achievement => (
                <SelectItem key={achievement.id} value={achievement.id}>
                  <div className="flex items-center gap-2">
                    {achievement.icon}
                    <div className="flex flex-col">
                      <span className="font-medium">{achievement.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {achievement.points} points
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedAchievementId && (
            <div className="p-3 border rounded-lg bg-muted/50">
              {availableAchievements
                .filter(a => a.id === selectedAchievementId)
                .map(achievement => (
                  <div key={achievement.id} className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                      {achievement.description}
                    </p>
                    {achievement.category && (
                      <p className="text-xs text-muted-foreground">
                        Catégorie: {achievement.category}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              setMessage(null);
            }}
            disabled={isSubmitting}
          >
            Annuler
          </Button>
          <Button
            onClick={handleUnlock}
            disabled={!selectedAchievementId || isSubmitting}
          >
            {isSubmitting ? "Déblocage..." : "Débloquer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

