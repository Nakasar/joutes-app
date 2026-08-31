"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation.ts";
import { GameType } from "@/lib/types/Game.ts";
import { GAME_TYPE_OPTIONS } from "@/lib/constants/game-types.ts";
import { createGame } from "./actions.ts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

const FIELD_CLASS =
  "w-full px-4 py-2 border border-input rounded-lg bg-background focus:ring-2 focus:ring-ring focus:border-transparent";

const EMPTY = {
  name: "",
  slug: "",
  description: "",
  type: "TCG" as GameType,
};

/**
 * Création d'un jeu.
 *
 * Trois champs, et rien d'autre : images, fonctionnalités, lieux mis en avant
 * et deck builder se règlent sur la fiche du jeu, où la place ne manque pas.
 * La boîte mène droit à cette fiche une fois le jeu créé, plutôt que de laisser
 * l'administrateur le retrouver dans la liste.
 */
export function GameForm({ trigger }: { trigger?: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await createGame({
        slug: formData.slug.length > 0 ? formData.slug : undefined,
        name: formData.name,
        description: formData.description,
        type: formData.type,
      });

      if (result.success && result.game) {
        setFormData(EMPTY);
        setOpen(false);
        router.push(`/admin/games/${result.game.slug ?? result.game.id}`);
      } else {
        setError(result.error || "Erreur lors de l'ajout du jeu");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setFormData(EMPTY);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger || <Button>Ajouter un jeu</Button>}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nouveau jeu</DialogTitle>
          <DialogDescription>
            De quoi le nommer et l&apos;adresser. Le reste se règle sur sa fiche.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-game-name" className="block text-sm font-medium text-foreground mb-1">
              Nom du jeu
            </label>
            <input
              id="new-game-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label htmlFor="new-game-slug" className="block text-sm font-medium text-foreground mb-1">
              ID du jeu
            </label>
            <input
              id="new-game-slug"
              type="text"
              value={formData.slug}
              onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
              className={`${FIELD_CLASS} font-mono`}
            />
          </div>

          <div>
            <label htmlFor="new-game-type" className="block text-sm font-medium text-foreground mb-1">
              Type de jeu
            </label>
            <select
              id="new-game-type"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as GameType })}
              className={FIELD_CLASS}
            >
              {GAME_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="new-game-description"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Description
            </label>
            <textarea
              id="new-game-description"
              required
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={FIELD_CLASS}
            />
          </div>

          <div className="flex flex-wrap gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isPending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Ajout en cours..." : "Ajouter"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
