"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";

import { toggleFollowUserAction } from "./[userTagOrId]/profile-actions.ts";

/**
 * Suivre un compte depuis le registre.
 *
 * Bascule optimiste puis recalage : le compteur d'abonnés vit sur le serveur,
 * et `router.refresh()` le rapporte. En cas d'échec, le bouton revient à son
 * état d'avant — un bouton qui dit « suivi » sans que rien ne le soit est pire
 * qu'un bouton qui n'a pas marché.
 */
export default function FollowUserButton({
  userId,
  isFollowing: initial,
}: {
  userId: string;
  isFollowing: boolean;
}) {
  const t = useTranslations("Users.profile.actions");
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initial);
  const [isBusy, startTransition] = useTransition();

  const toggle = () => {
    const next = !isFollowing;
    setIsFollowing(next);

    startTransition(async () => {
      const result = await toggleFollowUserAction(userId);

      if (!result.success) {
        setIsFollowing(!next);
        toast.error(t(`errors.${result.error}` as "errors.FAILED"));
        return;
      }

      setIsFollowing(result.following);
      router.refresh();
    });
  };

  return (
    <Button
      variant={isFollowing ? "secondary" : "default"}
      size="sm"
      onClick={toggle}
      disabled={isBusy}
      aria-pressed={isFollowing}
      className="min-h-11 sm:min-h-9"
    >
      {isBusy ? (
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : isFollowing ? (
        <Check className="mr-2 h-3.5 w-3.5" aria-hidden />
      ) : (
        <UserPlus className="mr-2 h-3.5 w-3.5" aria-hidden />
      )}
      {isFollowing ? t("following") : t("follow")}
    </Button>
  );
}
