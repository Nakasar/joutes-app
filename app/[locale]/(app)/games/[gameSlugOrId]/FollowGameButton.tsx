"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Heart } from "lucide-react";
import { addGameToUserList, removeGameFromUserList } from "@/app/[locale]/(app)/account/actions.ts";
import { notifyGamesChanged } from "@/lib/games/games-changed.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("Games");

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
      // Le menu « Jeux » de l'en-tête vit sur ces listes : sans le signal, il
      // resterait en retard d'un suivi jusqu'au prochain chargement complet.
      notifyGamesChanged();
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
        ? t("detail.follow.loading")
        : following
        ? t("detail.follow.unfollow")
        : t("detail.follow.follow")}
    </Button>
  );
}
