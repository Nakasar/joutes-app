"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

type FavoriteDeckButtonProps = {
  deckId: string;
  isFavorited: boolean;
  onAfterToggleAction?: () => void;
  className?: string;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "outline" | "secondary" | "ghost";
  showLabel?: boolean;
};

export default function FavoriteDeckButton({
  deckId,
  isFavorited,
  onAfterToggleAction,
  className,
  size = "sm",
  variant = "outline",
  showLabel = true,
}: FavoriteDeckButtonProps) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(isFavorited);
  const [isPending, setIsPending] = useState(false);

  const handleToggle = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setIsPending(true);
    try {
      const response = await fetch(`/api/decks/${deckId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ favorite: !favorited }),
      });

      if (!response.ok) {
        console.error("Impossible de mettre à jour le favori");
        return;
      }

      const nextValue = !favorited;
      setFavorited(nextValue);
      onAfterToggleAction?.();
      router.refresh();
    } catch (error) {
      console.error("Error toggling favorite:", error);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant={favorited ? "default" : variant}
      size={size}
      className={className}
      onClick={handleToggle}
      disabled={isPending}
    >
      <Star className={`h-4 w-4 ${showLabel ? "mr-2" : ""} ${favorited ? "fill-current" : ""}`} />
      {showLabel && (favorited ? "Favori" : "Ajouter aux favoris")}
    </Button>
  );
}
