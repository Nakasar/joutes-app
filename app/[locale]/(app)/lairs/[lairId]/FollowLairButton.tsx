"use client";

import { useState, useTransition } from "react";
import { addLairToUserList, removeLairFromUserList } from "@/app/[locale]/(app)/account/actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

interface FollowLairButtonProps {
  lairId: string;
  isFollowing: boolean;
  isAuthenticated: boolean;
}

/**
 * Suivre le lieu.
 *
 * Une fois suivi, le bouton porte l'accent du lieu : c'est le seul point de la
 * bannière où la marque blanche s'exprime en aplat, et l'état « suivi » est
 * justement celui qu'on doit reconnaître d'un coup d'œil.
 */
export default function FollowLairButton({
  lairId,
  isFollowing: initialIsFollowing,
  isAuthenticated,
}: FollowLairButtonProps) {
  const t = useTranslations("Lairs");
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!isAuthenticated) {
    return null;
  }

  const handleToggleFollow = () => {
    startTransition(async () => {
      if (isFollowing) {
        const result = await removeLairFromUserList(lairId);
        if (result.success) {
          setIsFollowing(false);
          setError(null);
          router.refresh();
        } else {
          setError(result.error || t("follow.errors.generic"));
        }
      } else {
        const result = await addLairToUserList(lairId);
        if (result.success) {
          setIsFollowing(true);
          setError(null);
          router.refresh();
        } else {
          setError(result.error || t("follow.errors.generic"));
        }
      }
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        size="sm"
        variant={isFollowing ? "default" : "secondary"}
        onClick={handleToggleFollow}
        disabled={isPending}
        className={
          isFollowing
            ? "bg-[var(--lair-accent)] text-[var(--lair-accent-foreground)] hover:bg-[var(--lair-accent)]/90"
            : undefined
        }
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
        ) : isFollowing ? (
          <Check className="mr-2 h-4 w-4" aria-hidden />
        ) : (
          <Bell className="mr-2 h-4 w-4" aria-hidden />
        )}
        {isFollowing ? t("follow.following") : t("follow.follow")}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
