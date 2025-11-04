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
  const [displayName, setDisplayName] = useState("");
  const [discriminator, setDiscriminator] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) {
      setError("Veuillez entrer un nom d'utilisateur");
      return;
    }

    if (!discriminator.trim() || discriminator.length !== 4) {
      setError("Le discriminant doit être un nombre à 4 chiffres");
      return;
    }

    startTransition(async () => {
      const result = await addPlayerToMatchAction(matchId, displayName.trim(), discriminator.trim());

      if (result.success) {
        setIsOpen(false);
        setDisplayName("");
        setDiscriminator("");
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
              Entrez le nom d'utilisateur et le discriminant du joueur à ajouter (format: username#1234)
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive rounded text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Nom d'utilisateur <span className="text-destructive">*</span>
              </label>
              <Input
                id="displayName"
                type="text"
                placeholder="username"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="discriminator" className="text-sm font-medium">
                Discriminant <span className="text-destructive">*</span>
              </label>
              <Input
                id="discriminator"
                type="text"
                placeholder="1234"
                value={discriminator}
                onChange={(e) => setDiscriminator(e.target.value)}
                maxLength={4}
                pattern="\d{4}"
                disabled={isPending}
                required
              />
              <p className="text-xs text-muted-foreground">
                Le discriminant est le nombre à 4 chiffres après le # (ex: username#1234)
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
