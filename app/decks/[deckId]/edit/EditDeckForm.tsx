"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Game } from "@/lib/types/Game";
import { Deck } from "@/lib/types/Deck";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";
import { updateDeckAction } from "../../actions";
import { Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

type EditDeckFormProps = {
  deck: Deck;
  games: Game[];
};

export default function EditDeckForm({ deck, games }: EditDeckFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: deck.name,
    gameId: deck.gameId,
    url: deck.url || "",
    description: deck.description || "",
    decklist: deck.decklist || "",
    visibility: deck.visibility,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await updateDeckAction(deck.id, formData);

      if (result.success) {
        toast.success("Deck mis à jour", {
          description: "Votre deck a été modifié avec succès.",
        });
        router.push(`/decks/${deck.id}`);
      } else {
        toast.error("Erreur", {
          description: result.error || "Impossible de modifier le deck.",
        });
      }
    } catch (error) {
      console.error("Error updating deck:", error);
      toast.error("Erreur", {
        description: "Une erreur est survenue lors de la modification du deck.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
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
              rows={6}
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
              rows={12}
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

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/decks/${deck.id}`)}
              disabled={isLoading}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Annuler
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enregistrer les modifications
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
