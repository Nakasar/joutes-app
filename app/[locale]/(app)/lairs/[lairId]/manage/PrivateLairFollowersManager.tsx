"use client";

import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";
import { removeFollowerFromPrivateLair, type PrivateLairError } from "@/app/[locale]/(app)/account/private-lairs-actions.ts";

/**
 * Les refus de l'action serveur, traduits ici.
 *
 * Ils sont distingués parce qu'ils ne se valent pas : « vous n'êtes pas
 * propriétaire » ne passera jamais, et inviter à réessayer y était trompeur.
 */
const ERROR_KEYS: Record<PrivateLairError, string> = {
  NOT_AUTHENTICATED: "errors.notAuthenticated",
  LAIR_NOT_FOUND: "errors.lairNotFound",
  NOT_OWNER: "errors.notOwner",
  NOT_PRIVATE: "errors.notPrivate",
  IS_OWNER: "errors.isOwner",
  FAILED: "errors.failed",
};
import { User } from "@/lib/types/User.ts";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { UserMinus, Loader2, AlertCircle, Users } from "lucide-react";

interface PrivateLairFollowersManagerProps {
  lairId: string;
  followers: User[];
  owners: User[];
}

export default function PrivateLairFollowersManager({
  lairId,
  followers,
  owners,
}: PrivateLairFollowersManagerProps) {
  const t = useTranslations("Lairs.manage.followers");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localFollowers, setLocalFollowers] = useState(followers);

  const ownerIds = new Set(owners.map((o) => o.id));

  const handleRemoveFollower = (userId: string, userName: string) => {
    if (
      !confirm(
        t("removeConfirm", { name: userName })
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await removeFollowerFromPrivateLair(lairId, userId);

      if (result.success) {
        setSuccess(t("removed", { name: userName }));
        setLocalFollowers(localFollowers.filter((f) => f.id !== userId));
        setError(null);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(t(ERROR_KEYS[result.error]));
        setSuccess(null);
      }
    });
  };

  // Filtrer les abonnés pour ne pas afficher les propriétaires
  const nonOwnerFollowers = localFollowers.filter((f) => !ownerIds.has(f.id));

  if (nonOwnerFollowers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto opacity-50 mb-2" />
            <p>{t("empty")}</p>
            <p className="text-sm mt-1">
              {t("emptyHint")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {t("titleWithCount", { count: nonOwnerFollowers.length })}
        </CardTitle>
        <CardDescription>
          {t("description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {nonOwnerFollowers.map((follower) => (
            <div
              key={follower.id}
              className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <img
                  src={follower.profileImage || follower.avatar}
                  alt={follower.displayName || follower.username}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <p className="font-semibold">
                    {follower.displayName || follower.username}
                    {follower.discriminator && (
                      <span className="text-muted-foreground">#{follower.discriminator}</span>
                    )}
                  </p>
                  {follower.email && (
                    <p className="text-sm text-muted-foreground">{follower.email}</p>
                  )}
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleRemoveFollower(
                    follower.id,
                    follower.displayName || follower.username
                  )
                }
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <UserMinus className="h-4 w-4 mr-2" />
                    {t("remove")}
                  </>
                )}
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
