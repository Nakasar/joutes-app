"use client";

import { useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button.tsx";

import { setSocialPostHidden } from "./actions.ts";

/**
 * Masquer une publication, ou la réafficher.
 *
 * Rendu par `SocialPostCard`, et **seulement sur la page dédiée** : la fiche du
 * jeu est le chemin le plus fréquenté du site, et y lire la session pour douze
 * vignettes alourdirait tout le monde pour un geste qui se produit une fois par
 * mois. La modération se fait de toute façon mieux devant les cent vignettes
 * que devant douze, et « voir tout » est à un clic.
 *
 * Le droit est lu **une fois pour la grille**, côté serveur, et passé en
 * `canModerate` — pas une lecture par vignette.
 */
export default function HidePostButton({
  postId,
  hidden,
  gameSlug,
}: {
  postId: string;
  hidden: boolean;
  gameSlug: string;
}) {
  const t = useTranslations("Games.social.moderation");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  const toggle = () => {
    setError(false);

    startTransition(async () => {
      const result = await setSocialPostHidden(postId, !hidden, gameSlug);
      setError(!result.success);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={toggle}
        disabled={isPending}
        className="text-gray-300 hover:text-white"
      >
        {hidden ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}
        {hidden ? t("unhide") : t("hide")}
      </Button>
      {error && <span className="text-destructive text-xs">{t("error")}</span>}
    </div>
  );
}
