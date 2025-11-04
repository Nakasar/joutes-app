"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlayerToMatchAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

type AddPlayerToMatchProps = {
  matchId: string;
};

export default function AddPlayerToMatch({ matchId }: AddPlayerToMatchProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerTag, setPlayerTag] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedTag = playerTag.trim();

    if (!trimmedTag) {
      setError("Veuillez entrer le tag du joueur");
      return;
    }

    // Découper le tag sur le #
    const parts = trimmedTag.split("#");
    
    if (parts.length !== 2) {
      setError("Le tag doit être au format username#1234");
      return;
    }

    const [displayName, discriminator] = parts;

    if (!displayName.trim()) {
      setError("Le nom d'utilisateur ne peut pas être vide");
      return;
    }

    if (!discriminator.trim() || discriminator.length !== 4 || !/^\d{4}$/.test(discriminator)) {
      setError("Le discriminant doit être un nombre à 4 chiffres");
      return;
    }

    startTransition(async () => {
      const result = await addPlayerToMatchAction(matchId, displayName.trim(), discriminator.trim());

      if (result.success) {
        setIsOpen(false);
        setPlayerTag("");
        router.refresh();
      } else {
        setError(result.error || "Erreur lors de l'ajout du joueur");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4 mr-2" />
          Ajouter un joueur
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Ajouter un joueur</DialogTitle>
            <DialogDescription>
              Entrez le tag complet du joueur au format username#1234
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="playerTag" className="text-sm font-medium">
                Tag Joueur <span className="text-destructive">*</span>
              </label>
              <Input
                id="playerTag"
                type="text"
                placeholder="username#1234"
                value={playerTag}
                onChange={(e) => setPlayerTag(e.target.value)}
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Format attendu : username#1234 (nom d'utilisateur suivi du # et d'un nombre à 4 chiffres)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isPending}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
