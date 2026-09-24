"use client";

import { useState, useTransition } from "react";
import { addLairToUserList, removeLairFromUserList } from "@/app/[locale]/(app)/account/actions.ts";
import { useRouter } from "@/i18n/navigation.ts";
import { useTranslations } from "next-intl";
import { Bell, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  DEFAULT_LAIR_NOTIFICATION_PREFERENCE,
  type LairNotificationPreference,
} from "@/lib/lairs/notification-prefs.ts";
import LairNotificationLevel from "./LairNotificationLevel.tsx";

interface FollowLairButtonProps {
  lairId: string;
  isFollowing: boolean;
  isAuthenticated: boolean;
  /** Ce que le visiteur reçoit du lieu, s'il le suit. */
  notificationPreference?: LairNotificationPreference;
}

/**
 * Suivre le lieu.
 *
 * Une fois suivi, le bouton porte l'accent du lieu : c'est le seul point de la
 * bannière où la marque blanche s'exprime en aplat, et l'état « suivi » est
 * justement celui qu'on doit reconnaître d'un coup d'œil.
 *
 * Suivi, il est flanqué d'une cloche qui règle ce qu'on reçoit du lieu
 * (`LairNotificationLevel`). Un lieu qu'on se met à suivre part en « Tout ».
 */
export default function FollowLairButton({
  lairId,
  isFollowing: initialIsFollowing,
  isAuthenticated,
  notificationPreference = DEFAULT_LAIR_NOTIFICATION_PREFERENCE,
}: FollowLairButtonProps) {
  const t = useTranslations("Lairs");
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  // Change à chaque nouveau suivi : la cloche repart alors de « Tout », au lieu
  // de garder l'état d'avant le désabonnement.
  const [followGeneration, setFollowGeneration] = useState(0);
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
          setFollowGeneration((generation) => generation + 1);
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
      <div className="flex flex-wrap items-center gap-1.5">
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
        {isFollowing && (
          <LairNotificationLevel
            key={followGeneration}
            lairId={lairId}
            initialPreference={
              followGeneration === 0 ? notificationPreference : DEFAULT_LAIR_NOTIFICATION_PREFERENCE
            }
            className="shrink-0 px-2.5"
          />
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
