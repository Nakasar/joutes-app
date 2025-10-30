"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateUserDisplayNameAction } from "./actions";
import { User as UserIcon, Loader2, Check, AlertCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { formatFullUsername } from "@/lib/utils";

interface UsernameManagerProps {
  currentDisplayName?: string;
  currentDiscriminator?: string;
}

export default function UsernameManager({
  currentDisplayName,
  currentDiscriminator,
}: UsernameManagerProps) {
  const [displayName, setDisplayName] = useState(currentDisplayName || "");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fullUsername, setFullUsername] = useState(
    formatFullUsername(currentDisplayName, currentDiscriminator)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await updateUserDisplayNameAction(displayName);

    setIsLoading(false);

    if (result.success) {
      setSuccess("Nom d'utilisateur mis à jour avec succès !");
      if (result.fullUsername) {
        setFullUsername(result.fullUsername);
      }
      // Réinitialiser le message de succès après 3 secondes
      setTimeout(() => setSuccess(null), 3000);
    } else {
      setError(result.error || "Une erreur est survenue");
    }
  };

  const hasChanges = displayName !== (currentDisplayName || "");
  const hasDisplayName = currentDisplayName && currentDiscriminator;

  return (
    <div className="space-y-4">
      {hasDisplayName ? (
        <div className="p-4 bg-muted/50 rounded-lg border">
          <p className="text-sm text-muted-foreground mb-1">
            Votre nom d&apos;utilisateur complet
          </p>
          <p className="text-2xl font-bold font-mono">{fullUsername}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Seule la partie avant le # peut être modifiée
          </p>
        </div>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <div className="ml-2">
            <p className="font-semibold">Aucun nom d&apos;utilisateur défini</p>
            <p className="text-sm text-muted-foreground">
              Définissez votre nom d&apos;utilisateur ci-dessous. Un numéro à 4 chiffres vous sera
              automatiquement attribué.
            </p>
          </div>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="displayName" className="text-sm font-medium">
            Nom d&apos;utilisateur{" "}
            {!hasDisplayName && <span className="text-muted-foreground">(nouveau)</span>}
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
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
            <Button
              type="submit"
              disabled={isLoading || !hasChanges || !displayName}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {hasDisplayName ? "Modifier" : "Définir"}
                </>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            3 à 20 caractères. Lettres, chiffres, tirets (-) et underscores (_) uniquement.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <p className="ml-2">{error}</p>
          </Alert>
        )}

        {success && (
          <Alert className="border-green-500 text-green-700 bg-green-50">
            <Check className="h-4 w-4 text-green-600" />
            <p className="ml-2 font-semibold">{success}</p>
          </Alert>
        )}
      </form>
    </div>
  );
}
