"use client";

import { useState } from "react";
import { updateProfileVisibilityAction } from "./user-actions";
import { Button } from "@/components/ui/button";
import { Globe, Lock } from "lucide-react";

interface ProfileVisibilityToggleProps {
  initialIsPublic: boolean;
  userTag?: string;
}

export default function ProfileVisibilityToggle({ 
  initialIsPublic, 
  userTag 
}: ProfileVisibilityToggleProps) {
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleToggle = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const newValue = !isPublic;
    const result = await updateProfileVisibilityAction(newValue);

    if (result.success) {
      setIsPublic(newValue);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error || "Erreur lors de la mise à jour");
    }

    setIsLoading(false);
  };

  const profileUrl = userTag 
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/users/${userTag.replace('#', '')}`
    : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-start gap-3 flex-1">
          {isPublic ? (
            <Globe className="h-5 w-5 text-green-600 mt-0.5" />
          ) : (
            <Lock className="h-5 w-5 text-muted-foreground mt-0.5" />
          )}
          <div className="flex-1">
            <h4 className="text-base font-semibold">
              Profil {isPublic ? "public" : "privé"}
            </h4>
            <p className="text-sm text-muted-foreground mt-1">
              {isPublic 
                ? "Votre profil affiche vos jeux et lieux suivis. Votre userTag et votre avatar sont visibles par tous."
                : "Seul votre userTag et votre avatar sont visibles publiquement. Vos jeux et lieux restent privés."
              }
            </p>
            {isPublic && profileUrl && (
              <p className="text-xs text-muted-foreground mt-2">
                Lien de votre profil :{" "}
                <a 
                  href={profileUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {profileUrl}
                </a>
              </p>
            )}
          </div>
        </div>
        <Button
          onClick={handleToggle}
          disabled={isLoading}
          variant={isPublic ? "outline" : "default"}
          size="sm"
        >
          {isLoading ? "..." : isPublic ? "Rendre privé" : "Rendre public"}
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-3">
          {error}
        </div>
      )}

      {success && (
        <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded p-3">
          Visibilité du profil mise à jour avec succès !
        </div>
      )}
    </div>
  );
}
