"use client";

import { useState } from "react";
import { Game } from "@/lib/types/Game";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createDeckAction } from "./actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type CreateDeckDialogProps = {
  games: Game[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
};

export default function CreateDeckDialog({
  games,
  open,
  onOpenChange,
  onSuccess,
}: CreateDeckDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    gameId: "",
    url: "",
    description: "",
    decklist: "",
    visibility: "private" as "private" | "public",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await createDeckAction(formData);

      if (result.success) {
        toast.success("Deck créé", {
          description: "Votre deck a été créé avec succès.",
        });
        setFormData({
          name: "",
          gameId: "",
          url: "",
          description: "",
          decklist: "",
          visibility: "private",
        });
        onSuccess();
      } else {
        toast.error("Erreur", {
          description: result.error || "Impossible de créer le deck.",
        });
      }
    } catch (error) {
      console.error("Error creating deck:", error);
      toast.error("Erreur", {
        description: "Une erreur est survenue lors de la création du deck.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Créer un nouveau deck</DialogTitle>
            <DialogDescription>
              Ajoutez un nouveau deck à votre collection.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">
                Nom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Azir Tokens"
                required
                disabled={isLoading}
              />
            </div>

            {/* Game */}
            <div className="space-y-2">
              <Label htmlFor="gameId">
                Jeu <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formData.gameId}
                onValueChange={(value) => setFormData({ ...formData, gameId: value })}
                required
                disabled={isLoading}
              >
                <SelectTrigger id="gameId">
                  <SelectValue placeholder="Sélectionnez un jeu" />
                </SelectTrigger>
                <SelectContent>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="url">URL (optionnel)</Label>
              <Input
                id="url"
                type="url"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="https://example.com/mon-deck"
                disabled={isLoading}
              />
              <p className="text-xs text-muted-foreground">
                Lien vers un site extérieur présentant le deck
              </p>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description (optionnel)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Décrivez votre deck, sa stratégie..."
                rows={4}
                disabled={isLoading}
              />
            </div>

            {/* Decklist */}
            <div className="space-y-2">
              <Label htmlFor="decklist">Liste de cartes (optionnel)</Label>
              <Textarea
                id="decklist"
                value={formData.decklist}
                onChange={(e) => setFormData({ ...formData, decklist: e.target.value })}
                placeholder="3x Carte A&#10;2x Carte B&#10;1x Carte C..."
                rows={10}
                disabled={isLoading}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Notez la composition complète de votre deck
              </p>
            </div>

            {/* Visibility */}
            <div className="space-y-2">
              <Label htmlFor="visibility">Visibilité</Label>
              <Select
                value={formData.visibility}
                onValueChange={(value: "private" | "public") =>
                  setFormData({ ...formData, visibility: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="visibility">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privé (visible uniquement par moi)</SelectItem>
                  <SelectItem value="public">Public (visible par tous)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Créer le deck
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
