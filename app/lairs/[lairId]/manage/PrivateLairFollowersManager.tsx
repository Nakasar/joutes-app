"use client";

import { useState, useTransition } from "react";
import { removeFollowerFromPrivateLair } from "@/app/account/private-lairs-actions";
import { User } from "@/lib/types/User";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [localFollowers, setLocalFollowers] = useState(followers);

  const ownerIds = new Set(owners.map((o) => o.id));

  const handleRemoveFollower = (userId: string, userName: string) => {
    if (
      !confirm(
        `Êtes-vous sûr de vouloir retirer ${userName} de ce lieu ? Il ne pourra plus voir les événements de ce lieu.`
      )
    ) {
      return;
    }

    startTransition(async () => {
      const result = await removeFollowerFromPrivateLair(lairId, userId);

      if (result.success) {
        setSuccess(`${userName} a été retiré avec succès`);
        setLocalFollowers(localFollowers.filter((f) => f.id !== userId));
        setError(null);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(result.error || "Erreur lors du retrait de l'utilisateur");
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
            Abonnés
          </CardTitle>
          <CardDescription>
            Gérez les utilisateurs qui suivent ce lieu privé
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto opacity-50 mb-2" />
            <p>Aucun abonné pour le moment.</p>
            <p className="text-sm mt-1">
              Partagez le code d&apos;invitation pour inviter des utilisateurs.
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
          Abonnés ({nonOwnerFollowers.length})
        </CardTitle>
        <CardDescription>
          Gérez les utilisateurs qui suivent ce lieu privé
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
                    Retirer
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
