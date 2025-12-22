"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { addGameToUserList, removeGameFromUserList } from "@/app/account/actions";
import { useRouter } from "next/navigation";

interface FollowGameButtonProps {
  gameId: string;
  isFollowing: boolean;
  isAuthenticated: boolean;
}

export default function FollowGameButton({
  gameId,
  isFollowing,
  isAuthenticated,
}: FollowGameButtonProps) {
  const [following, setFollowing] = useState(isFollowing);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      if (following) {
        const result = await removeGameFromUserList(gameId);
        if (result.success) {
          setFollowing(false);
        } else {
          console.error("Erreur:", result.error);
        }
      } else {
        const result = await addGameToUserList(gameId);
        if (result.success) {
          setFollowing(true);
        } else {
          console.error("Erreur:", result.error);
        }
      }
      router.refresh();
    } catch (error) {
      console.error("Erreur lors du suivi du jeu:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="lg"
      variant={following ? "default" : "secondary"}
      onClick={handleToggleFollow}
      disabled={loading}
      className={
        following
          ? "bg-red-600 hover:bg-red-700 text-white px-8"
          : "bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 px-8"
      }
    >
      <Heart
        className={`h-5 w-5 mr-2 ${following ? "fill-current" : ""}`}
      />
      {loading
        ? "Chargement..."
        : following
        ? "Ne plus suivre"
        : "Suivre ce jeu"}
    </Button>
  );
}

