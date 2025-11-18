"use client";

import { useState } from "react";
import { updateProfileImageAction } from "./user-actions";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Image as ImageIcon } from "lucide-react";

interface ProfileImageUploaderProps {
  currentImage?: string;
  currentAvatar: string;
}

export default function ProfileImageUploader({ 
  currentImage,
  currentAvatar
}: ProfileImageUploaderProps) {
  const [profileImage, setProfileImage] = useState(currentImage);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload?type=profile", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erreur lors de l&apos;upload");
      }

      const data = await response.json();
      setProfileImage(data.url);

      // Enregistrer l'URL dans la base de données
      const result = await updateProfileImageAction(data.url);
      
      if (result.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.error || "Erreur lors de la mise à jour");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l&apos;upload du fichier"
      );
      setProfileImage(currentImage);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    setError(null);
    setSuccess(false);
    
    // On remet l'image par défaut (avatar Discord)
    setProfileImage(undefined);
    
    const result = await updateProfileImageAction("");
    
    if (result.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error || "Erreur lors de la suppression");
    }
  };

  const displayImage = profileImage || currentAvatar;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6">
        {/* Aperçu de l'image */}
        <div className="flex-shrink-0">
          {displayImage ? (
            <img
              src={displayImage}
              alt="Image de profil"
              className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/20"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
              <ImageIcon className="h-12 w-12 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-1 space-y-3">
          <div>
            <h4 className="text-sm font-medium mb-1">Image de profil</h4>
            <p className="text-xs text-muted-foreground">
              Téléchargez une image personnalisée pour votre profil. Format JPG, PNG, WebP ou GIF (max 5 MB).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => document.getElementById('profile-image-input')?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? "Upload en cours..." : "Choisir une image"}
            </Button>

            <input
              id="profile-image-input"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />

            {profileImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemoveImage}
                disabled={uploading}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer
              </Button>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          {success && (
            <p className="text-sm text-green-600">Image mise à jour avec succès !</p>
          )}

          {!profileImage && (
            <p className="text-xs text-muted-foreground">
              Sans image personnalisée, votre avatar Discord sera utilisé.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
