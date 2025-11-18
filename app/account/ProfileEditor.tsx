"use client";

import { useState } from "react";
import { updateProfileInfoAction } from "./user-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FileText, Globe, Plus, Trash2 } from "lucide-react";

interface ProfileEditorProps {
  initialDescription?: string;
  initialWebsite?: string;
  initialSocialLinks?: string[];
}

export default function ProfileEditor({ 
  initialDescription = "",
  initialWebsite = "",
  initialSocialLinks = []
}: ProfileEditorProps) {
  const [description, setDescription] = useState(initialDescription);
  const [website, setWebsite] = useState(initialWebsite);
  const [socialLinks, setSocialLinks] = useState<string[]>(initialSocialLinks);
  const [newSocialLink, setNewSocialLink] = useState("");
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleAddSocialLink = () => {
    if (newSocialLink.trim() && socialLinks.length < 10) {
      setSocialLinks([...socialLinks, newSocialLink.trim()]);
      setNewSocialLink("");
    }
  };

  const handleRemoveSocialLink = (index: number) => {
    setSocialLinks(socialLinks.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);
    setSuccess(false);

    const result = await updateProfileInfoAction({
      description: description.trim() || undefined,
      website: website.trim() || undefined,
      socialLinks: socialLinks.filter(link => link.trim()),
    });

    if (result.success) {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error || "Erreur lors de la mise à jour");
    }

    setIsLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
        </div>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Parlez-nous de vous..."
          maxLength={500}
          rows={4}
          className="w-full px-3 py-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted-foreground text-right">
          {description.length} / 500 caractères
        </p>
      </div>

      {/* Site web */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <label htmlFor="website" className="text-sm font-medium">
            Site web
          </label>
        </div>
        <Input
          id="website"
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://example.com"
        />
      </div>

      {/* Réseaux sociaux */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium">
            Réseaux sociaux
          </label>
        </div>

        {/* Liste des liens existants */}
        {socialLinks.length > 0 && (
          <div className="space-y-2">
            {socialLinks.map((link, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={link}
                  readOnly
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveSocialLink(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Ajouter un nouveau lien */}
        {socialLinks.length < 10 && (
          <div className="flex items-center gap-2">
            <Input
              type="url"
              value={newSocialLink}
              onChange={(e) => setNewSocialLink(e.target.value)}
              placeholder="https://twitter.com/username"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSocialLink();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddSocialLink}
              disabled={!newSocialLink.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        )}

        {socialLinks.length >= 10 && (
          <p className="text-xs text-muted-foreground">
            Limite de 10 liens atteinte
          </p>
        )}
      </div>

      {/* Bouton de sauvegarde */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <Button
          onClick={handleSave}
          disabled={isLoading}
        >
          {isLoading ? "Enregistrement..." : "Enregistrer"}
        </Button>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        {success && (
          <p className="text-sm text-green-600">Profil mis à jour avec succès !</p>
        )}
      </div>
    </div>
  );
}
