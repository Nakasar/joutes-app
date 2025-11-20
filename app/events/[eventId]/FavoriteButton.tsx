"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";
import { toggleEventFavoriteAction } from "../actions";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type FavoriteButtonProps = {
  eventId: string;
  initialIsFavorited: boolean;
};

export default function FavoriteButton({ eventId, initialIsFavorited }: FavoriteButtonProps) {
  const router = useRouter();
  const [isFavorited, setIsFavorited] = useState(initialIsFavorited);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    
    // Optimistic update
    setIsFavorited(!isFavorited);

    try {
      const result = await toggleEventFavoriteAction(eventId);

      if (result.success) {
        router.refresh();
      } else {
        // Rollback on error
        setIsFavorited(isFavorited);
        console.error(result.error);
      }
    } catch (err) {
      // Rollback on error
      setIsFavorited(isFavorited);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleToggle}
      disabled={loading}
      variant={isFavorited ? "default" : "outline"}
      className="w-full"
    >
      <Star className={cn("h-4 w-4 mr-2", isFavorited && "fill-yellow-500 text-yellow-500")} />
      {loading ? "Chargement..." : isFavorited ? "Retirer des favoris" : "Ajouter aux favoris"}
    </Button>
  );
}
