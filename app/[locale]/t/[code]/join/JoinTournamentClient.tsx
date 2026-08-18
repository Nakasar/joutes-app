"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { storeSyncKey } from "@/lib/tournament-sync-storage";

const STATUS_LABELS: Record<string, string> = {
  draft: "À venir",
  "in-progress": "En cours",
  completed: "Terminé",
};

type Props = {
  code: string;
  tournamentId: string;
  name: string;
  status: "draft" | "in-progress" | "completed";
  preRegistration: boolean;
  playerCount: number;
  isLoggedIn: boolean;
  alreadyJoined: boolean;
};

export function JoinTournamentClient({
  code,
  tournamentId,
  name,
  status,
  preRegistration,
  playerCount,
  isLoggedIn,
  alreadyJoined,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const closed = status === "completed";

  const join = async (asGuest: boolean) => {
    if (asGuest && !displayName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(asGuest ? { displayName: displayName.trim() } : {}) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Erreur lors de l'inscription");
      }
      // Invité : on lie ce navigateur au tournoi via la clé de synchronisation.
      if (data.player?.syncKey) {
        storeSyncKey(tournamentId, data.player.syncKey);
      }
      router.push(`/tournaments/${tournamentId}/player`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur lors de l'inscription");
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-2xl">{name}</CardTitle>
          <Badge variant="secondary">{STATUS_LABELS[status] ?? status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Rejoindre le tournoi · {playerCount} joueur(s) inscrit(s)
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {preRegistration && !closed && (
          <p className="rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
            Ce tournoi est en pré-inscription : votre participation sera à confirmer par
            l&apos;organisateur.
          </p>
        )}

        {closed ? (
          <p className="text-sm text-muted-foreground">
            Ce tournoi est terminé : les inscriptions sont closes.
          </p>
        ) : alreadyJoined ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Vous êtes déjà inscrit à ce tournoi.</p>
            <Button asChild>
              <Link href={`/tournaments/${tournamentId}/player`}>Accéder à mon portail joueur</Link>
            </Button>
          </div>
        ) : isLoggedIn ? (
          <Button onClick={() => join(false)} disabled={busy}>
            Valider ma participation
          </Button>
        ) : (
          <div className="space-y-4">
            <Button asChild variant="outline" className="w-full">
              <Link href={`/login?redirect=/t/${code}/join`}>Se connecter pour participer</Link>
            </Button>

            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">ou sans compte</span>
              <span className="h-px flex-1 bg-border" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="join-name">Nom d&apos;utilisateur</Label>
              <div className="flex gap-2">
                <Input
                  id="join-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      join(true);
                    }
                  }}
                  placeholder="Votre nom"
                  maxLength={100}
                />
                <Button onClick={() => join(true)} disabled={busy || !displayName.trim()}>
                  Valider
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Vous rejoindrez comme invité. Ce navigateur sera lié au tournoi pour accéder à
                votre portail joueur.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
