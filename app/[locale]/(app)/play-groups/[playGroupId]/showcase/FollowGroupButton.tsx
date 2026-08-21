"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Link } from "@/i18n/navigation.ts";

import { togglePlayGroupFollow } from "../actions.ts";

/**
 * Suivre le groupe.
 *
 * L'état bascule tout de suite et le compteur suit : c'est une préférence
 * personnelle, sans conséquence, et attendre l'aller-retour pour un bouton
 * qu'on peut recliquer ne servirait qu'à le faire clignoter. Le serveur
 * corrige au rafraîchissement suivant s'il refuse.
 */
export default function FollowGroupButton({
  playGroupId,
  isFollowing,
  followersCount,
  isAuthenticated,
}: {
  playGroupId: string;
  isFollowing: boolean;
  followersCount: number;
  isAuthenticated: boolean;
}) {
  const t = useTranslations("PlayGroups.showcase");
  const [pending, startTransition] = useTransition();
  const [following, setFollowing] = useState(isFollowing);
  const [count, setCount] = useState(followersCount);

  if (!isAuthenticated) {
    return (
      <Button size="sm" asChild>
        <Link href="/login">{t("followSignIn")}</Link>
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant={following ? "outline" : "default"}
      disabled={pending}
      aria-pressed={following}
      onClick={() => {
        const next = !following;
        setFollowing(next);
        setCount((current) => Math.max(0, current + (next ? 1 : -1)));

        startTransition(async () => {
          const result = await togglePlayGroupFollow(playGroupId);
          if (!result.success) {
            setFollowing(!next);
            setCount((current) => Math.max(0, current + (next ? -1 : 1)));
            toast.error(t("followError"));
          }
        });
      }}
    >
      {following && <Check aria-hidden />}
      {following ? t("following", { count }) : t("follow")}
    </Button>
  );
}
