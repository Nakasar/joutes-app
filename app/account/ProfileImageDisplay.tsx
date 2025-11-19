"use client";

import { useState } from "react";
import { updateProfileImageAction, removeProfileImageAction } from "./user-actions";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Image as ImageIcon, Pencil, X, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProfileImageDisplayProps {
  currentImage?: string;
  currentAvatar: string;
}

export default function ProfileImageDisplay({ 
  currentImage,
  currentAvatar
}: ProfileImageDisplayProps) {
  const [profileImage, setProfileImage] = useState(currentImage);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const displayImage = profileImage || currentAvatar;

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const maxSize = 1 * 1024 * 1024; // 1.5 Mo
      if (file.size > maxSize) {
        throw new Error("Le fichier est trop volumineux (max 1 Mo)");
      }

      const formData = new FormData();
      formData.append("file", file);

      const result = await updateProfileImageAction(formData);
      
      if (result.success && result.imageUrl) {
        setProfileImage(result.imageUrl);
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setIsDialogOpen(false);
        }, 2000);
      } else {
        throw new Error(result.error || "Erreur lors de la mise à jour");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'upload du fichier"
      );
      setProfileImage(currentImage);
    } finally {
      setUploading(false);
    }
  };

  const handleRemoveImage = async () => {
    setError(null);
    setSuccess(false);
    
    const result = await removeProfileImageAction();
    
    if (result.success) {
      setProfileImage(undefined);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setIsDialogOpen(false);
      }, 2000);
    } else {
      setError(result.error || "Erreur lors de la suppression");
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <img
          src={displayImage}
          alt="Image de profil"
          className="w-20 h-20 rounded-full object-cover ring-2 ring-primary/20"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsDialogOpen(true)}
        >
          <Pencil className="h-4 w-4 mr-2" />
          Modifier l&apos;image
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier l&apos;image de profil</DialogTitle>
            <DialogDescription>
              Téléchargez une image personnalisée pour votre profil public. Format JPG, PNG, WebP ou GIF (max 1 Mo).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Aperçu actuel */}
            <div className="flex justify-center">
              {displayImage ? (
                <img
                  src={displayImage}
                  alt="Aperçu"
                  className="w-32 h-32 rounded-full object-cover ring-4 ring-primary/20"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center">
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <div>
                <input
                  type="file"
                  id="profile-image-upload"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  disabled={uploading}
                  className="hidden"
                />
                <label htmlFor="profile-image-upload">
                  <Button
                    type="button"
                    variant="default"
                    className="w-full"
                    disabled={uploading}
                    onClick={() => document.getElementById('profile-image-upload')?.click()}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Téléchargement...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Télécharger une nouvelle image
                      </>
                    )}
                  </Button>
                </label>
              </div>

              {profileImage && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleRemoveImage}
                  disabled={uploading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer l&apos;image personnalisée
                </Button>
              )}

              <p className="text-xs text-muted-foreground text-center">
                {profileImage 
                  ? "Supprimer l&apos;image personnalisée restaurera votre avatar par défaut."
                  : "Aucune image personnalisée définie. L&apos;avatar par défaut est utilisé."
                }
              </p>
            </div>

            {/* Messages */}
            {error && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </div>
            )}

            {success && (
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg p-3">
                <Check className="h-4 w-4" />
                Image mise à jour avec succès !
              </div>
            )}

            {/* Footer */}
            <div className="flex justify-end pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsDialogOpen(false)}
                disabled={uploading}
              >
                <X className="h-4 w-4 mr-2" />
                Fermer
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
