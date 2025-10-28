"use client";

import { Lair } from "@/lib/types/Lair";
import { useState, useTransition } from "react";
import { removeLairFromUserList } from "./actions";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Trash2, Loader2, AlertCircle, ExternalLink } from "lucide-react";

interface LairsManagerProps {
  userLairs: Lair[];
}

export default function LairsManager({ userLairs }: LairsManagerProps) {
  const [followedLairs, setFollowedLairs] = useState<Lair[]>(userLairs);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleRemoveLair = (lairId: string) => {
    startTransition(async () => {
      const result = await removeLairFromUserList(lairId);
      if (result.success) {
        setFollowedLairs(followedLairs.filter(l => l.id !== lairId));
        setError(null);
      } else {
        setError(result.error || "Erreur lors de la suppression du lieu");
      }
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {followedLairs.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground space-y-2">
          <MapPin className="h-12 w-12 mx-auto opacity-50" />
          <p>Vous ne suivez aucun lieu pour le moment.</p>
          <p className="text-sm">
            Visitez la{" "}
            <Link href="/lairs" className="text-primary hover:underline font-semibold">
              liste des lieux
            </Link>{" "}
            pour en suivre !
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {followedLairs.map((lair) => (
            <Card
              key={lair.id}
              className="hover:shadow-md transition-shadow"
            >
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/lairs/${lair.id}`}
                    className="font-semibold text-lg text-primary hover:underline flex items-center gap-2 group"
                  >
                    {lair.name}
                    <ExternalLink className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                  <p className="text-sm text-muted-foreground mt-1">
                    {lair.games.length} jeu(x) disponible(s)
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleRemoveLair(lair.id)}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Ne plus suivre
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-center text-sm text-muted-foreground pt-4 border-t">
        <p>
          Pour suivre de nouveaux lieux, visitez la{" "}
          <Link href="/lairs" className="text-primary hover:underline font-semibold">
            page des lieux
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
