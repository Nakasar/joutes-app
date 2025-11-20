"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPrivateLair } from "@/app/account/private-lairs-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, AlertCircle, Lock } from "lucide-react";

export default function CreatePrivateLairButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const [newLairName, setNewLairName] = useState("");
  const [newLairAddress, setNewLairAddress] = useState("");

  const handleCreateLair = () => {
    if (!newLairName.trim()) {
      setError("Le nom du lieu est requis");
      return;
    }

    startTransition(async () => {
      const result = await createPrivateLair(
        newLairName.trim(),
        newLairAddress.trim() || undefined
      );

      if (result.success && result.lairId) {
        setNewLairName("");
        setNewLairAddress("");
        setIsOpen(false);
        setError(null);
        
        // Rediriger vers la page du lair créé
        router.push(`/lairs/${result.lairId}`);
      } else {
        setError(result.error || "Erreur lors de la création du lieu");
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Créer un lieu privé
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Créer un lieu privé
          </DialogTitle>
          <DialogDescription>
            Les lieux privés ne sont visibles que par les utilisateurs que vous invitez via un
            code QR unique.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Nom du lieu *
            </label>
            <Input
              id="name"
              placeholder="Mon lieu de jeu"
              value={newLairName}
              onChange={(e) => setNewLairName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="address" className="text-sm font-medium">
              Adresse (optionnel)
            </label>
            <Input
              id="address"
              placeholder="123 rue de la Paix"
              value={newLairAddress}
              onChange={(e) => setNewLairAddress(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setIsOpen(false);
              setError(null);
            }}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button onClick={handleCreateLair} disabled={isPending}>
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
