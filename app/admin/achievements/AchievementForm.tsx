"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Achievement } from "@/lib/types/Achievement";
import { createAchievementAction, updateAchievementAction } from "./actions";
import { AchievementIconUploader } from "./AchievementIconUploader";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  DEFAULT_STATUS_TONE,
  STATUS_TONE_OPTIONS,
  type StatusTone,
} from "@/lib/achievements/status-tone";

// Fallback Label if not exists, but usually it does in shadcn
function SimpleLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">{children}</label>;
}

export function AchievementForm({ initialData }: { initialData?: Achievement }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: initialData?.name || "",
    description: initialData?.description || "",
    iconImage: initialData?.iconImage || "",
    points: initialData?.points || 10,
    category: initialData?.category || "Général",
    isHidden: initialData?.isHidden || false,
    isStatus: initialData?.isStatus || false,
    statusTone: initialData?.statusTone || DEFAULT_STATUS_TONE,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, isHidden: checked }));
  };

  // Cocher « statut » met les points à zéro : un statut est une reconnaissance,
  // pas une performance, et le laisser peser dans le total des points de
  // quelqu'un fausserait le classement des succès.
  const handleStatusChange = (checked: boolean) => {
    setFormData(prev => ({ ...prev, isStatus: checked, points: checked ? 0 : prev.points }));
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Basic validation
      if (!formData.name || !formData.description) {
        throw new Error("Veuillez remplir tous les champs obligatoires.");
      }
      // Une image est requise pour un nouveau succès ; en édition, un ancien
      // succès sans image conserve son emoji d'origine.
      if (!initialData && !formData.iconImage) {
        throw new Error("Veuillez importer une image carrée pour l'icône du succès.");
      }

      // Transmet iconImage tel quel (URL ou "") : un $set de chaîne vide retire
      // l'image de façon fiable ; l'affichage retombe alors sur l'emoji.
      const data = {
        ...formData,
        points: Number(formData.points),
      };

      let result;
      if (initialData) {
        result = await updateAchievementAction(initialData.id, data);
      } else {
        result = await createAchievementAction(data);
      }

      if (!result.success) {
        throw new Error(result.error || "Une erreur est survenue.");
      }

      router.push("/admin/achievements");
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Une erreur est survenue.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-8 max-w-2xl">
      {error && (
        <div className="bg-destructive/15 text-destructive px-4 py-2 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <SimpleLabel htmlFor="name">Nom</SimpleLabel>
        <Input
          id="name"
          name="name"
          placeholder="Premiers pas"
          value={formData.name}
          onChange={handleChange}
          required
        />
      </div>

      <div className="space-y-2">
        <SimpleLabel htmlFor="description">Description</SimpleLabel>
        <Textarea
          id="description"
          name="description"
          placeholder="Connectez-vous pour la première fois."
          value={formData.description}
          onChange={handleChange}
          required
        />
      </div>

      <div className="space-y-2">
        <SimpleLabel>Icône (image carrée)</SimpleLabel>
        <AchievementIconUploader
          value={formData.iconImage || undefined}
          onChange={(url) => setFormData((prev) => ({ ...prev, iconImage: url || "" }))}
        />
      </div>

      <div className="space-y-2">
        <SimpleLabel htmlFor="points">Points</SimpleLabel>
        <Input
          id="points"
          name="points"
          type="number"
          value={formData.points}
          onChange={handleChange}
          required
          min={0}
        />
      </div>

      <div className="space-y-2">
        <SimpleLabel htmlFor="category">Catégorie</SimpleLabel>
        <Input
          id="category"
          name="category"
          placeholder="Général"
          value={formData.category}
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
        <Checkbox
          id="isHidden"
          checked={formData.isHidden}
          onCheckedChange={handleCheckboxChange}
        />
        <div className="space-y-1 leading-none">
          <SimpleLabel htmlFor="isHidden">
            Succès caché
          </SimpleLabel>
          <p className="text-sm text-muted-foreground">
            Ce succès ne sera pas visible tant qu&apos;il n&apos;est pas débloqué.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border p-4">
        <div className="flex flex-row items-start space-x-3 space-y-0">
          <Checkbox id="isStatus" checked={formData.isStatus} onCheckedChange={handleStatusChange} />
          <div className="space-y-1 leading-none">
            <SimpleLabel htmlFor="isStatus">Statut</SimpleLabel>
            <p className="text-sm text-muted-foreground">
              Affiché en badge à côté du pseudonyme, et non seulement dans la liste des
              succès. N&apos;ouvre aucun droit : c&apos;est de la reconnaissance, pas de
              l&apos;accès.
            </p>
          </div>
        </div>

        {formData.isStatus && (
          <div className="space-y-2">
            <SimpleLabel htmlFor="statusTone">Teinte du badge</SimpleLabel>
            <select
              id="statusTone"
              name="statusTone"
              value={formData.statusTone}
              onChange={(e) => setFormData(prev => ({ ...prev, statusTone: e.target.value as StatusTone }))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
            >
              {STATUS_TONE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting}>
        {initialData ? "Mettre à jour" : "Créer le succès"}
      </Button>
    </form>
  );
}

