"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUserDisplayNameAction } from "./actions";
import { User as UserIcon, Loader2, Check, AlertCircle, Pencil, X } from "lucide-react";
import { formatFullUsername } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface UsernameDisplayProps {
  currentDisplayName?: string;
  currentDiscriminator?: string;
}

export default function UsernameDisplay({
  currentDisplayName,
  currentDiscriminator,
}: UsernameDisplayProps) {
  const [displayName, setDisplayName] = useState(currentDisplayName || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [fullUsername, setFullUsername] = useState(
    formatFullUsername(currentDisplayName, currentDiscriminator)
  );

  const hasDisplayName = currentDisplayName && currentDiscriminator;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await updateUserDisplayNameAction(displayName);

    setIsLoading(false);

    if (result.success) {
      setSuccess("Nom d&apos;utilisateur mis à jour avec succès !");
      if (result.fullUsername) {
        setFullUsername(result.fullUsername);
      }
      setTimeout(() => {
        setSuccess(null);
        setIsDialogOpen(false);
      }, 2000);
    } else {
      setError(result.error || "Une erreur est survenue");
    }
  };

  const handleCancel = () => {
    setDisplayName(currentDisplayName || "");
    setError(null);
    setSuccess(null);
    setIsDialogOpen(false);
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {hasDisplayName ? (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Nom d&apos;utilisateur</p>
              <p className="text-lg font-semibold font-mono">{fullUsername}</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Nom d&apos;utilisateur</p>
              <p className="text-sm text-muted-foreground italic">Non défini</p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Modifier
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {hasDisplayName ? "Modifier le nom d&apos;utilisateur" : "Définir le nom d&apos;utilisateur"}
            </DialogTitle>
            <DialogDescription>
              {hasDisplayName 
                ? "Seule la partie avant le # peut être modifiée. Le numéro discriminant reste inchangé."
                : "Choisissez votre nom d&apos;utilisateur. Un numéro à 4 chiffres vous sera automatiquement attribué."
              }
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {hasDisplayName && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Nom actuel</p>
                <p className="text-lg font-bold font-mono">{fullUsername}</p>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="displayName" className="text-sm font-medium">
                Nouveau nom d&apos;utilisateur
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="MonPseudo"
                  className="pl-10"
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_-]+"
                  title="Lettres, chiffres, tirets et underscores uniquement"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                3-20 caractères. Lettres, chiffres, tirets et underscores uniquement.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {success && (
              <div className="flex items-start gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
                <Check className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>{success}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={handleCancel}
                disabled={isLoading}
              >
                <X className="h-4 w-4 mr-2" />
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading || displayName === currentDisplayName}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Enregistrer
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
