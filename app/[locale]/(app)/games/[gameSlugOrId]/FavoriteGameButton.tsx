"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button.tsx";
import { Star } from "lucide-react";
import { setFavoriteGameAction } from "@/app/[locale]/(app)/account/actions.ts";
import { notifyGamesChanged } from "@/lib/games/games-changed.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";

/**
 * Met le jeu en favori — c'est-à-dire en tête du menu « Jeux » de la barre de
 * navigation (voir `docs/NAVIGATION_GAMES_MENU.md`).
 *
 * Le bouton n'a de sens que pour un jeu déjà suivi : un favori se choisit parmi
 * les jeux suivis, et le serveur refuse les autres. La page ne le rend donc que
 * dans ce cas, plutôt que de proposer une action vouée à échouer.
 */
export default function FavoriteGameButton({
  gameId,
  isFavorite,
}: {
  gameId: string;
  isFavorite: boolean;
}) {
  const [favorite, setFavorite] = useState(isFavorite);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const t = useTranslations("Games");

  const handleToggle = async () => {
    const next = !favorite;
    setLoading(true);
    // Affichage optimiste : l'étoile répond tout de suite, et revient en
    // arrière si le serveur refuse (jeu qui n'est plus suivi entre-temps).
    setFavorite(next);
    try {
      const result = await setFavoriteGameAction(gameId, next);
      if (!result.success) {
        setFavorite(!next);
        console.error("Erreur:", result.error);
        return;
      }
      // `router.refresh()` rejoue les composants serveur ; l'en-tête est un
      // composant client, il lui faut le signal pour se remettre à jour.
      notifyGamesChanged();
      router.refresh();
    } catch (error) {
      setFavorite(!next);
      console.error("Erreur lors de la mise en favori du jeu:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      size="lg"
      variant="secondary"
      onClick={handleToggle}
      disabled={loading}
      aria-pressed={favorite}
      className={
        favorite
          ? "bg-amber-500 hover:bg-amber-600 text-black px-8"
          : "bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20 px-8"
      }
    >
      <Star className={`h-5 w-5 mr-2 ${favorite ? "fill-current" : ""}`} />
      {loading
        ? t("detail.favorite.loading")
        : favorite
        ? t("detail.favorite.remove")
        : t("detail.favorite.add")}
    </Button>
  );
}
