"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRight, Check, Loader2, Settings, UserPlus, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation.ts";
import { Button } from "@/components/ui/button.tsx";
import ReportButton from "@/components/ReportButton.tsx";

import {
  requestFriendshipAction,
  toggleFollowUserAction,
  type ProfileActionError,
} from "./profile-actions.ts";

/**
 * Ce qu'on peut faire depuis la vitrine de quelqu'un.
 *
 * **Deux relations, deux boutons, et c'est délibéré.** S'abonner ne demande
 * rien à personne : on suit une vitrine comme on suit un lieu, et le compteur
 * d'abonnés le dit. Devenir ami se demande et s'accepte, ouvre la collection et
 * les parties partagées. Les confondre sous un seul bouton obligerait à choisir
 * lequel des deux gestes on abandonne — d'où l'abonnement en action principale,
 * puisque c'est celui qu'on fait sans y penser, et l'amitié à côté.
 *
 * La rangée porte `flex-wrap` : `Button` est `whitespace-nowrap shrink-0`, et
 * quatre d'entre eux sur un téléphone élargiraient le document entier.
 */
export default function ProfileActions({
  userId,
  isAuthenticated,
  isOwner,
  isFollowing: initialIsFollowing,
  isFriend,
  hasPendingFriendRequest: initialPending,
  canTrade,
}: {
  userId: string;
  isAuthenticated: boolean;
  isOwner: boolean;
  isFollowing: boolean;
  isFriend: boolean;
  hasPendingFriendRequest: boolean;
  /** La personne a-t-elle une liste de vente ? Sans quoi il n'y a rien à échanger. */
  canTrade: boolean;
}) {
  const t = useTranslations("Users.profile.actions");
  const router = useRouter();
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [pending, setPending] = useState(initialPending);
  const [isBusy, startTransition] = useTransition();

  const errorMessage = (error: ProfileActionError) =>
    t(`errors.${error}` as "errors.FAILED");

  if (isOwner) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <Button variant="secondary" size="sm" asChild>
          <Link href="/account?tab=showcase">
            <Settings className="mr-2 h-4 w-4" aria-hidden />
            {t("customise")}
          </Link>
        </Button>
      </div>
    );
  }

  const handleFollow = () => {
    // Bascule optimiste, puis recalage : le compteur d'abonnés vit sur le
    // serveur, et `router.refresh()` le rapporte.
    const next = !isFollowing;
    setIsFollowing(next);

    startTransition(async () => {
      const result = await toggleFollowUserAction(userId);

      if (!result.success) {
        setIsFollowing(!next);
        toast.error(errorMessage(result.error));
        return;
      }

      setIsFollowing(result.following);
      router.refresh();
    });
  };

  const handleFriendRequest = () => {
    startTransition(async () => {
      const result = await requestFriendshipAction(userId);

      if (!result.success) {
        // « Déjà demandé » n'est pas un échec de l'utilisateur : on met le
        // bouton dans l'état qu'il aurait dû avoir plutôt que de le gronder.
        if (result.error === "ALREADY") {
          setPending(true);
          return;
        }

        toast.error(errorMessage(result.error));
        return;
      }

      setPending(true);
      toast.success(t("friendRequested"));
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {isAuthenticated && (
        <Button
          variant={isFollowing ? "secondary" : "default"}
          size="sm"
          onClick={handleFollow}
          disabled={isBusy}
          aria-pressed={isFollowing}
          className="min-h-11 sm:min-h-0"
        >
          {isBusy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
          ) : isFollowing ? (
            <Check className="mr-2 h-4 w-4" aria-hidden />
          ) : (
            <UserPlus className="mr-2 h-4 w-4" aria-hidden />
          )}
          {isFollowing ? t("following") : t("follow")}
        </Button>
      )}

      {isAuthenticated && !isFriend && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleFriendRequest}
          disabled={isBusy || pending}
          className="min-h-11 sm:min-h-0"
        >
          <UserRoundCheck className="mr-2 h-4 w-4" aria-hidden />
          {pending ? t("friendPending") : t("addFriend")}
        </Button>
      )}

      {isAuthenticated && isFriend && (
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground sm:min-h-0 sm:py-1.5">
          <UserRoundCheck className="h-4 w-4" aria-hidden />
          {t("friend")}
        </span>
      )}

      {/* Vers l'écran d'échange, et non vers un échange déjà créé : ouvrir un
          document à deux faces sur un clic de curiosité laisserait des échanges
          vides derrière chaque visite. C'est là qu'on invite par tag. */}
      {isAuthenticated && canTrade && (
        <Button variant="outline" size="sm" asChild className="min-h-11 sm:min-h-0">
          <Link href="/trade">
            <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
            {t("proposeTrade")}
          </Link>
        </Button>
      )}

      <ReportButton
        contentType="user"
        contentId={userId}
        variant="outline"
        size="icon-sm"
        className="min-h-11 min-w-11 sm:min-h-0 sm:min-w-0"
      />
    </div>
  );
}
