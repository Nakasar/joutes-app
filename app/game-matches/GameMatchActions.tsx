"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteGameMatchAction, removePlayerFromMatchAction } from "./actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Trash2, UserMinus } from "lucide-react";

type GameMatchActionsProps = {
  matchId: string;
  isCreator: boolean;
  currentUserId: string;
  playerUserId?: string;
  playerUsername?: string;
  variant?: "delete-match" | "remove-player" | "leave-match";
};

export default function GameMatchActions({
  matchId,
  isCreator,
  currentUserId,
  playerUserId,
  playerUsername,
  variant = "leave-match",
}: GameMatchActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeleteMatch = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteGameMatchAction(matchId);
      
      if (result.success) {
        router.refresh();
        setIsDialogOpen(false);
      } else {
        setError(result.error || "Erreur lors de la suppression");
      }
    });
  };

  const handleRemovePlayer = () => {
    if (!playerUserId) return;
    
    setError(null);
    startTransition(async () => {
      const result = await removePlayerFromMatchAction(matchId, playerUserId);
      
      if (result.success) {
        router.refresh();
        setIsDialogOpen(false);
      } else {
        setError(result.error || "Erreur lors du retrait du joueur");
      }
    });
  };

  const handleLeaveMatch = () => {
    setError(null);
    startTransition(async () => {
      const result = await removePlayerFromMatchAction(matchId, currentUserId);
      
      if (result.success) {
        router.refresh();
        setIsDialogOpen(false);
      } else {
        setError(result.error || "Erreur lors du départ de la partie");
      }
    });
  };

  // Supprimer la partie (créateur uniquement)
  if (variant === "delete-match" && isCreator) {
    return (
      <>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={isPending}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Supprimer la partie
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer la partie</DialogTitle>
              <DialogDescription>
                Êtes-vous sûr de vouloir supprimer cette partie ? Cette action est irréversible.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-destructive text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteMatch}
                disabled={isPending}
              >
                {isPending ? "Suppression..." : "Supprimer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Retirer un joueur (créateur uniquement)
  if (variant === "remove-player" && isCreator && playerUserId) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={isPending}
          className="h-8 w-8 p-0"
        >
          <UserMinus className="h-4 w-4" />
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Retirer le joueur</DialogTitle>
              <DialogDescription>
                Êtes-vous sûr de vouloir retirer {playerUsername} de cette partie ?
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-destructive text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleRemovePlayer}
                disabled={isPending}
              >
                {isPending ? "Retrait..." : "Retirer"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Quitter la partie (joueur lui-même)
  if (variant === "leave-match") {
    return (
      <>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
          disabled={isPending}
        >
          <UserMinus className="h-4 w-4 mr-2" />
          Quitter la partie
        </Button>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Quitter la partie</DialogTitle>
              <DialogDescription>
                Êtes-vous sûr de vouloir vous retirer de cette partie ?
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-destructive text-sm">
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleLeaveMatch}
                disabled={isPending}
              >
                {isPending ? "Départ..." : "Quitter"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}
